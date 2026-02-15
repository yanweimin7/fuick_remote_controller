package com.example.remote_control_app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.core.content.ContextCompat.getSystemService
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.PluginRegistry
import java.io.ByteArrayOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding

/**
 * 屏幕捕获插件 - 使用 MediaProjection API 捕获屏幕
 */
class ScreenCapturePlugin : FlutterPlugin, ActivityAware, MethodChannel.MethodCallHandler, EventChannel.StreamHandler,
    PluginRegistry.ActivityResultListener {

    companion object {
        const val CHANNEL_NAME = "screen_capture"
        const val EVENT_CHANNEL_NAME = "screen_capture/frames"
        const val REQUEST_CODE = 1001

        @JvmStatic
        fun registerWith(engine: FlutterEngine, activity: Activity): ScreenCapturePlugin {
            val plugin = ScreenCapturePlugin()
            plugin.activity = activity

            MethodChannel(engine.dartExecutor.binaryMessenger, CHANNEL_NAME)
                .setMethodCallHandler(plugin)

            EventChannel(engine.dartExecutor.binaryMessenger, EVENT_CHANNEL_NAME)
                .setStreamHandler(plugin)

            return plugin
        }
    }

    private var activity: Activity? = null
    private var methodChannel: MethodChannel? = null
    private var eventChannel: EventChannel? = null

    // FlutterPlugin 接口实现
    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        // android.util.Log.d("ScreenCapture", "onAttachedToEngine")
        val messenger = binding.binaryMessenger
        
        val mChannel = MethodChannel(messenger, CHANNEL_NAME)
        mChannel.setMethodCallHandler(this)
        methodChannel = mChannel

        val eChannel = EventChannel(messenger, EVENT_CHANNEL_NAME)
        eChannel.setStreamHandler(this)
        eventChannel = eChannel
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        // android.util.Log.d("ScreenCapture", "onDetachedFromEngine")
        methodChannel?.setMethodCallHandler(null)
        eventChannel?.setStreamHandler(null)
        methodChannel = null
        eventChannel = null
    }

    // ActivityAware 接口实现
    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        // android.util.Log.d("ScreenCapture", "onAttachedToActivity")
        activity = binding.activity
        binding.addActivityResultListener(this)
    }

    override fun onDetachedFromActivityForConfigChanges() {
        // android.util.Log.d("ScreenCapture", "onDetachedFromActivityForConfigChanges")
        activity = null
    }

    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) {
        // android.util.Log.d("ScreenCapture", "onReattachedToActivityForConfigChanges")
        activity = binding.activity
        binding.addActivityResultListener(this)
    }

    override fun onDetachedFromActivity() {
        // android.util.Log.d("ScreenCapture", "onDetachedFromActivity")
        activity = null
    }
    private var mediaProjection: MediaProjection? = null
    private var mediaProjectionManager: MediaProjectionManager? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var handler: Handler? = null
    private var executor: ExecutorService? = null
    private var eventSink: EventChannel.EventSink? = null
    private var mediaProjectionCallback: MediaProjection.Callback? = null

    private var captureWidth = 1280
    private var captureHeight = 720
    private var screenWidth = 0
    private var screenHeight = 0
    private var captureQuality = 80
    private var frameRate = 30
    private var isCapturing = false

    private var pendingResult: MethodChannel.Result? = null

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "requestCapturePermission" -> requestCapturePermission(result)
            "startCapture" -> startCapture(call, result)
            "stopCapture" -> stopCapture(result)
            "updateSettings" -> updateSettings(call, result)
            "isCapturing" -> result.success(isCapturing)
            else -> result.notImplemented()
        }
    }

    /**
     * 请求屏幕捕获权限
     */
    private fun requestCapturePermission(result: MethodChannel.Result) {
        val activity = this.activity ?: run {
            result.error("NO_ACTIVITY", "Activity is null", null)
            return
        }

        pendingResult = result

        // Android 14+ 要求: 不能在获得投影权限之前启动 mediaProjection 类型的 Service
        // 所以这里我们只请求权限，Service 的启动移到 onActivityResult 中
        
        mediaProjectionManager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE)
            as MediaProjectionManager

        val intent = mediaProjectionManager?.createScreenCaptureIntent()
        activity.startActivityForResult(intent, REQUEST_CODE)
    }

    /**
     * 开始屏幕捕获
     */
    private fun startCapture(call: MethodCall, result: MethodChannel.Result) {
        // android.util.Log.d("ScreenCapture", "startCapture called, isCapturing=$isCapturing")
        
        // 强制重置帧处理状态，防止上次异常导致的死锁
        isProcessingFrame.set(false)
        
        if (isCapturing) {
            // android.util.Log.d("ScreenCapture", "Already capturing, ignoring request")
            result.success(true)
            return
        }

        val activity = this.activity ?: run {
            android.util.Log.e("ScreenCapture", "startCapture failed: Activity is null")
            result.error("NO_ACTIVITY", "Activity is null", null)
            return
        }

        // 检查 MediaProjection 是否已准备就绪
        if (mediaProjection == null) {
            // android.util.Log.d("ScreenCapture", "MediaProjection is null, requesting permission first...")
            // 如果 MediaProjection 未就绪，应该先请求权限，而不是直接报错
            // 但根据目前的逻辑，startCapture 应该在权限请求后调用
            // 这里我们尝试再次请求权限
            requestCapturePermission(result)
            return
        }

        val projection = mediaProjection!!
        
        // 启动前台服务 (Android 10+ 必须)
        val serviceIntent = Intent(activity, ScreenCaptureService::class.java)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            activity.startForegroundService(serviceIntent)
        } else {
            activity.startService(serviceIntent)
        }

        // 获取屏幕分辨率
        val displayMetrics = DisplayMetrics()
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            activity.display?.getRealMetrics(displayMetrics)
        } else {
            @Suppress("DEPRECATION")
            activity.windowManager.defaultDisplay.getMetrics(displayMetrics)
        }
        screenWidth = displayMetrics.widthPixels
        screenHeight = displayMetrics.heightPixels

        if (screenWidth <= 0 || screenHeight <= 0) {
            screenWidth = 720
            screenHeight = 1280
        }

        // 初始化 Handler 和 Executor
        handler = Handler(Looper.getMainLooper())
        executor = Executors.newSingleThreadExecutor()

        // 恢复原始分辨率和质量
        val scale = 0.25f 
        // 确保宽高为偶数，避免某些设备编码器不支持奇数
        captureWidth = ((screenWidth * scale).toInt() / 2) * 2
        captureHeight = ((screenHeight * scale).toInt() / 2) * 2
        captureQuality = 15 // 降低默认质量
 

        // android.util.Log.d("ScreenCapture", "Capture settings: ${captureWidth}x${captureHeight}, quality=$captureQuality")

        // 创建 ImageReader
        // 注意：maxImages 至少为 2，为了更流畅，我们可以设为 3
        imageReader = ImageReader.newInstance(
            captureWidth, captureHeight,
            PixelFormat.RGBA_8888, 3
        )

        isCapturing = true

        // 设置 ImageAvailableListener
        imageReader?.setOnImageAvailableListener({ reader ->
            if (!isCapturing) return@setOnImageAvailableListener
            
            // 快速丢弃策略：如果处理线程忙，直接丢弃当前帧，防止 Buffer 积压
            if (isProcessingFrame.get()) {
                try {
                    // 必须 acquire 再 close 才能释放 buffer
                    val image = reader.acquireLatestImage()
                    image?.close()
                } catch (e: Exception) {
                    // ignore
                }
                return@setOnImageAvailableListener
            }
            
            executor?.execute {
                captureFrame()
            }
        }, handler)

        // Android 14 Requirement: Register a callback before creating virtual display
        mediaProjectionCallback = object : MediaProjection.Callback() {
            override fun onStop() {
                super.onStop()
                stopCapture(null)
            }
        }
        projection.registerCallback(mediaProjectionCallback!!, handler)

        // 创建 VirtualDisplay
        try {
            virtualDisplay = projection.createVirtualDisplay(
                "ScreenCapture",
                captureWidth, captureHeight, displayMetrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader?.surface, null, null
            )
            // android.util.Log.d("ScreenCapture", "VirtualDisplay created: $virtualDisplay")
            result.success(true)
        } catch (e: Exception) {
            android.util.Log.e("ScreenCapture", "Error creating VirtualDisplay", e)
            isCapturing = false
            result.error("VIRTUAL_DISPLAY_ERROR", e.message, null)
        }
    }

    /**
     * 开始帧捕获循环 (已移除，改用 ImageAvailableListener 驱动)
     */
    private fun startFrameCapture() {
        // 不再需要
    }

    private var isProcessingFrame = java.util.concurrent.atomic.AtomicBoolean(false)

    /**
     * 捕获单帧
     */
    private fun captureFrame() {
        if (isProcessingFrame.get()) {
            return
        }
        
        var image: Image? = null
        try {
            // 记录开始时间
            val startTime = System.currentTimeMillis()

            image = imageReader?.acquireLatestImage()
            if (image == null) {
                return
            }

            isProcessingFrame.set(true)

            val planes = image.planes
            if (planes == null || planes.isEmpty()) {
                isProcessingFrame.set(false)
                return
            }

            val plane = planes[0]
            val buffer = plane.buffer
            val pixelStride = plane.pixelStride
            val rowStride = plane.rowStride
            
            // 计算 padding
            val rowPadding = rowStride - pixelStride * captureWidth

            // 1. 创建原始 Bitmap (包含 padding)
            val width = captureWidth + rowPadding / pixelStride
            val bitmap = Bitmap.createBitmap(
                width,
                captureHeight,
                Bitmap.Config.ARGB_8888
            )
            bitmap.copyPixelsFromBuffer(buffer)

            // 2. 裁剪掉 padding (如果需要)
            var finalBitmap = bitmap
            if (rowPadding > 0) {
                finalBitmap = Bitmap.createBitmap(bitmap, 0, 0, captureWidth, captureHeight)
            }

            // 3. 压缩为 JPEG
            val outputStream = ByteArrayOutputStream()
            finalBitmap.compress(Bitmap.CompressFormat.JPEG, captureQuality, outputStream)
            val jpegData = outputStream.toByteArray()

            // 释放 Bitmap 资源
            if (finalBitmap !== bitmap) {
                finalBitmap.recycle()
            }
            bitmap.recycle()

            val processTime = System.currentTimeMillis() - startTime
            if (processTime > 30) {
                // android.util.Log.w("ScreenCapture", "Slow frame processing: ${processTime}ms, size: ${jpegData.size} bytes")
            }

            // 发送数据给 Flutter 端
            handler?.post {
                try {
                    val result = HashMap<String, Any>()
                    result["data"] = jpegData
                    result["width"] = captureWidth
                    result["height"] = captureHeight
                    result["originalWidth"] = screenWidth
                    result["originalHeight"] = screenHeight
                    
                    if (eventSink != null) {
                        eventSink?.success(result)
                    } 
                } catch (e: Exception) {
                    android.util.Log.e("ScreenCapture", "Error sending event", e)
                } finally {
                    isProcessingFrame.set(false)
                }
            }

        } catch (e: Exception) {
            android.util.Log.e("ScreenCapture", "Error capturing frame", e)
            isProcessingFrame.set(false)
        } finally {
            image?.close()
        }
    }

    /**
     * 停止屏幕捕获
     */
    private fun stopCapture(result: MethodChannel.Result?) {
        isCapturing = false

        try {
            mediaProjectionCallback?.let { callback ->
                mediaProjection?.unregisterCallback(callback)
                mediaProjectionCallback = null
            }
        } catch (e: Exception) {
            // ignore
        }

        try {
            mediaProjection?.stop()
        } catch (e: Exception) {
            // ignore
        }
        mediaProjection = null

        virtualDisplay?.release()
        virtualDisplay = null

        imageReader?.close()
        imageReader = null

        executor?.shutdown()
        executor = null

        // 停止前台服务
        activity?.let {
            val serviceIntent = Intent(it, ScreenCaptureService::class.java)
            it.stopService(serviceIntent)
        }

        result?.success(true)
    }

    /**
     * 更新捕获设置
     */
    private fun updateSettings(call: MethodCall, result: MethodChannel.Result) {
        captureQuality = call.argument<Int>("quality") ?: captureQuality
        frameRate = call.argument<Int>("frameRate") ?: frameRate
        // 分辨率更新需要重新启动捕获
        result.success(true)
    }

    /**
     * 处理 Activity 结果
     */
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != REQUEST_CODE) return false

        if (resultCode == Activity.RESULT_OK && data != null) {
            // Android 14+: 必须在获取 MediaProjection 之前启动 Foreground Service (且类型为 mediaProjection)
            activity?.let {
                val serviceIntent = Intent(it, ScreenCaptureService::class.java)
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    it.startForegroundService(serviceIntent)
                } else {
                    it.startService(serviceIntent)
                }
            }

            // 延迟获取 MediaProjection，确保 Service.startForeground 已执行
            Handler(Looper.getMainLooper()).postDelayed({
                try {
                    mediaProjection = mediaProjectionManager?.getMediaProjection(resultCode, data)
                    pendingResult?.success(true)
                } catch (e: Exception) {
                    android.util.Log.e("ScreenCapture", "Error getting MediaProjection", e)
                    pendingResult?.error("PROJECTION_ERROR", e.message, null)
                } finally {
                    pendingResult = null
                }
            }, 500)
            
            // 返回 true，表示已处理，但在 postDelayed 中才真正完成
            return true
        } else {
            android.util.Log.w("ScreenCapture", "Permission denied or data is null")
            // 用户拒绝了权限，停止之前启动的前台服务
            activity?.let {
                val serviceIntent = Intent(it, ScreenCaptureService::class.java)
                it.stopService(serviceIntent)
            }
            pendingResult?.success(false)
        }
        pendingResult = null
        return true
    }

    // EventChannel.StreamHandler
    override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
        // android.util.Log.d("ScreenCapture", "EventChannel onListen: Sink established")
        eventSink = events
    }

    override fun onCancel(arguments: Any?) {
        // android.util.Log.d("ScreenCapture", "EventChannel onCancel: Sink destroyed")
        eventSink = null
    }
}
