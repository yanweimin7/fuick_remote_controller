package com.example.remote_control_app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.accessibility.AccessibilityManager
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Accessibility 控制插件 - 用于注入点击、滑动等操作
 */
class AccessibilityControlPlugin(private val context: Context) : MethodChannel.MethodCallHandler {

    companion object {
        const val CHANNEL_NAME = "accessibility_control"
        private const val TAG = "AccessibilityControl"

        @JvmStatic
        fun registerWith(engine: FlutterEngine, context: Context) {
            val plugin = AccessibilityControlPlugin(context)
            MethodChannel(engine.dartExecutor.binaryMessenger, CHANNEL_NAME)
                .setMethodCallHandler(plugin)
        }
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        // Log.d(TAG, "onMethodCall: ${call.method}") // 调试日志
        when (call.method) {
            "isAccessibilityEnabled" -> result.success(isAccessibilityEnabled())
            "openAccessibilitySettings" -> openAccessibilitySettings(result)
            "injectClick" -> injectClick(call, result)
            "injectSwipe" -> injectSwipe(call, result)
            "injectLongPress" -> injectLongPress(call, result)
            "injectKey" -> injectKey(call, result)
            "injectText" -> injectText(call, result)
            else -> result.notImplemented()
        }
    }

    /**
     * 检查 Accessibility 服务是否启用
     */
    private fun isAccessibilityEnabled(): Boolean {
        // 简化检查逻辑，直接看 Service 实例是否存在
        val service = RemoteControlAccessibilityService.instance
        val isEnabled = service != null
        // Log.d(TAG, "isAccessibilityEnabled: $isEnabled (Service instance: $service)")
        return isEnabled
    }
    
    /**
     * 打开 Accessibility 设置页面
     */
    private fun openAccessibilitySettings(result: MethodChannel.Result) {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        context.startActivity(intent)
        result.success(true)
    }

    /**
     * 注入点击操作
     */
    private fun injectClick(call: MethodCall, result: MethodChannel.Result) {
        val x = call.argument<Double>("x")?.toFloat() ?: 0f
        val y = call.argument<Double>("y")?.toFloat() ?: 0f
        
        // Log.d(TAG, "injectClick: ($x, $y)")

        val service = RemoteControlAccessibilityService.instance
        if (service == null) {
            Log.e(TAG, "injectClick failed: Service not running")
            result.error("SERVICE_NOT_RUNNING", "Accessibility service is not running", null)
            return
        }

        val success = service.performClick(x, y)
        // Log.d(TAG, "injectClick result: $success")
        result.success(success)
    }

    /**
     * 注入滑动操作
     */
    private fun injectSwipe(call: MethodCall, result: MethodChannel.Result) {
        val startX = call.argument<Double>("startX")?.toFloat() ?: 0f
        val startY = call.argument<Double>("startY")?.toFloat() ?: 0f
        val endX = call.argument<Double>("endX")?.toFloat() ?: 0f
        val endY = call.argument<Double>("endY")?.toFloat() ?: 0f
        val duration = call.argument<Int>("duration") ?: 300

        val service = RemoteControlAccessibilityService.instance
        if (service == null) {
            result.error("SERVICE_NOT_RUNNING", "Accessibility service is not running", null)
            return
        }

        val success = service.performSwipe(startX, startY, endX, endY, duration)
        result.success(success)
    }

    /**
     * 注入长按操作
     */
    private fun injectLongPress(call: MethodCall, result: MethodChannel.Result) {
        val x = call.argument<Double>("x")?.toFloat() ?: 0f
        val y = call.argument<Double>("y")?.toFloat() ?: 0f
        val duration = call.argument<Int>("duration") ?: 1000

        val service = RemoteControlAccessibilityService.instance
        if (service == null) {
            result.error("SERVICE_NOT_RUNNING", "Accessibility service is not running", null)
            return
        }

        val success = service.performLongPress(x, y, duration)
        result.success(success)
    }

    /**
     * 注入按键操作
     */
    private fun injectKey(call: MethodCall, result: MethodChannel.Result) {
        val key = call.argument<String>("key") ?: ""
        
        val service = RemoteControlAccessibilityService.instance
        if (service == null) {
            result.error("SERVICE_NOT_RUNNING", "Accessibility service is not running", null)
            return
        }

        val success = when (key) {
            "back" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
            "home" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
            "recent" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS)
            "power" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_POWER_DIALOG)
            "notification" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS)
            "quick_settings" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS)
            else -> false
        }
        result.success(success)
    }

    /**
     * 注入文本输入
     */
    private fun injectText(call: MethodCall, result: MethodChannel.Result) {
        val text = call.argument<String>("text") ?: ""
        
        val service = RemoteControlAccessibilityService.instance
        if (service == null) {
            result.error("SERVICE_NOT_RUNNING", "Accessibility service is not running", null)
            return
        }

        val success = service.inputText(text)
        result.success(success)
    }
}
