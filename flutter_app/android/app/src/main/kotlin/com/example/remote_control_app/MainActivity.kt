package com.example.remote_control_app

import android.content.Intent
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {

    private var screenCapturePlugin: ScreenCapturePlugin? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // 注册屏幕捕获插件
        flutterEngine.plugins.add(ScreenCapturePlugin())
        
        // 注册 Accessibility 控制插件
        AccessibilityControlPlugin.registerWith(flutterEngine, this)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        // 插件已自动绑定 ActivityResultListener
    }
}
