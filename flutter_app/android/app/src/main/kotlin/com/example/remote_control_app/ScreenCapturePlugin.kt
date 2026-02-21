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
 * Screen Capture Plugin - Use MediaProjection API to capture screen
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

    // FlutterPlugin interface implementation
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

    // ActivityAware interface implementation
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
     * Request screen capture permission
     */
    private fun requestCapturePermission(result: MethodChannel.Result) {
        val activity = this.activity ?: run {
            result.error("NO_ACTIVITY", "Activity is null", null)
            return
        }

        pendingResult = result

        // Android 14+ Requirement: Cannot start mediaProjection type Service before obtaining projection permission
        // So here we only request permission, Service startup is moved to onActivityResult
        
        mediaProjectionManager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE)
            as MediaProjectionManager

        val intent = mediaProjectionManager?.createScreenCaptureIntent()
        activity.startActivityForResult(intent, REQUEST_CODE)
    }

    /**
     * Start screen capture
     */
    private fun startCapture(call: MethodCall, result: MethodChannel.Result) {
        // android.util.Log.d("ScreenCapture", "startCapture called, isCapturing=$isCapturing")
        
        // Force reset frame processing state to prevent deadlock caused by previous exceptions
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

        // Check if MediaProjection is ready
        if (mediaProjection == null) {
            // android.util.Log.d("ScreenCapture", "MediaProjection is null, requesting permission first...")
            // If MediaProjection is not ready, should request permission first instead of erroring out directly
            // But based on current logic, startCapture should be called after permission request
            // Here we try to request permission again
            requestCapturePermission(result)
            return
        }

        val projection = mediaProjection!!
        
        // Start Foreground Service (Mandatory for Android 10+)
        val serviceIntent = Intent(activity, ScreenCaptureService::class.java)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            activity.startForegroundService(serviceIntent)
        } else {
            activity.startService(serviceIntent)
        }

        // Get Screen Resolution
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

        // Initialize Handler and Executor
        handler = Handler(Looper.getMainLooper())
        executor = Executors.newSingleThreadExecutor()

        // Get parameters
        val maxWidth = call.argument<Int>("maxWidth") ?: 1280
        val maxHeight = call.argument<Int>("maxHeight") ?: 720
        captureQuality = call.argument<Int>("quality") ?: 80

        // Calculate scale to fit within max dimensions while maintaining aspect ratio
        var scale = 1.0f
        if (screenWidth > maxWidth || screenHeight > maxHeight) {
            val wScale = maxWidth.toFloat() / screenWidth
            val hScale = maxHeight.toFloat() / screenHeight
            scale = if (wScale < hScale) wScale else hScale
        }
        
        // Ensure width and height are even, to avoid encoder issues on some devices
        captureWidth = ((screenWidth * scale).toInt() / 2) * 2
        captureHeight = ((screenHeight * scale).toInt() / 2) * 2

        android.util.Log.d("ScreenCapture", "Capture settings: ${captureWidth}x${captureHeight}, quality=$captureQuality, scale=$scale")

        // Create ImageReader
        // Note: maxImages must be at least 2, set to 3 for smoother performance
        imageReader = ImageReader.newInstance(
            captureWidth, captureHeight,
            PixelFormat.RGBA_8888, 3
        )

        isCapturing = true

        // Set ImageAvailableListener
        imageReader?.setOnImageAvailableListener({ reader ->
            if (!isCapturing) return@setOnImageAvailableListener
            
            // Fast drop policy: If processing thread is busy, drop current frame to prevent Buffer backlog
            if (isProcessingFrame.get()) {
                try {
                    // Must acquire then close to release buffer
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

        // Create VirtualDisplay
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
     * Start frame capture loop (Removed, driven by ImageAvailableListener)
     */
    private fun startFrameCapture() {
        // No longer needed
    }

    private var isProcessingFrame = java.util.concurrent.atomic.AtomicBoolean(false)

    /**
     * Capture single frame
     */
    private fun captureFrame() {
        if (isProcessingFrame.get()) {
            return
        }
        
        var image: Image? = null
        try {
            // Record start time
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
            
            // Calculate padding
            val rowPadding = rowStride - pixelStride * captureWidth

            // 1. Create original Bitmap (including padding)
            val width = captureWidth + rowPadding / pixelStride
            val bitmap = Bitmap.createBitmap(
                width,
                captureHeight,
                Bitmap.Config.ARGB_8888
            )
            bitmap.copyPixelsFromBuffer(buffer)

            // 2. Crop padding (if needed)
            var finalBitmap = bitmap
            if (rowPadding > 0) {
                finalBitmap = Bitmap.createBitmap(bitmap, 0, 0, captureWidth, captureHeight)
            }

            // 3. Compress to JPEG
            val outputStream = ByteArrayOutputStream()
            finalBitmap.compress(Bitmap.CompressFormat.JPEG, captureQuality, outputStream)
            val jpegData = outputStream.toByteArray()

            // Release Bitmap resources
            if (finalBitmap !== bitmap) {
                finalBitmap.recycle()
            }
            bitmap.recycle()

            val processTime = System.currentTimeMillis() - startTime
            
            android.util.Log.d("ScreenCapture", "Frame generated: ${jpegData.size} bytes, time: ${processTime}ms")

            // Send data to Flutter side
            // Must switch to main thread to send EventChannel message
            activity?.runOnUiThread {
                try {
                    android.util.Log.d("ScreenCapture", "Sending frame to Flutter via EventChannel")
                    val result = HashMap<String, Any>()
                    result["data"] = jpegData
                    result["timestamp"] = System.currentTimeMillis()
                    result["width"] = captureWidth
                    result["height"] = captureHeight
                    result["originalWidth"] = screenWidth
                    result["originalHeight"] = screenHeight
                    
                    if (eventSink != null) {
                         eventSink?.success(result)
                         android.util.Log.d("ScreenCapture", "Frame sent to Flutter successfully")
                    } else {
                         android.util.Log.e("ScreenCapture", "EventSink is null, cannot send frame")
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
     * Stop screen capture
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

        // Stop foreground service
        activity?.let {
            val serviceIntent = Intent(it, ScreenCaptureService::class.java)
            it.stopService(serviceIntent)
        }

        result?.success(true)
    }

    /**
     * Update capture settings
     */
    private fun updateSettings(call: MethodCall, result: MethodChannel.Result) {
        captureQuality = call.argument<Int>("quality") ?: captureQuality
        frameRate = call.argument<Int>("frameRate") ?: frameRate
        // Resolution update requires restarting capture
        result.success(true)
    }

    /**
     * Handle Activity Result
     */
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != REQUEST_CODE) return false

        if (resultCode == Activity.RESULT_OK && data != null) {
            // Android 14+: Must start Foreground Service (and type as mediaProjection) before obtaining MediaProjection
            activity?.let {
                val serviceIntent = Intent(it, ScreenCaptureService::class.java)
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    it.startForegroundService(serviceIntent)
                } else {
                    it.startService(serviceIntent)
                }
            }

            // Delay obtaining MediaProjection to ensure Service.startForeground has executed
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
            
            // Return true, indicating handled, but truly completed in postDelayed
            return true
        } else {
            android.util.Log.w("ScreenCapture", "Permission denied or data is null")
            // User denied permission, stop the previously started foreground service
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
