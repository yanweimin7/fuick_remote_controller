package com.example.remote_control_app

import android.content.Intent
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {

    private var screenCapturePlugin: ScreenCapturePlugin? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Register Screen Capture Plugin
        flutterEngine.plugins.add(ScreenCapturePlugin())
        
        // Register Accessibility Control Plugin
        AccessibilityControlPlugin.registerWith(flutterEngine, this)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        // Plugin is automatically bound to ActivityResultListener
    }
}
