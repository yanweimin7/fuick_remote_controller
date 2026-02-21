package com.example.remote_control_app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Screen Capture Foreground Service
 */
class ScreenCaptureService : Service() {

    companion object {
        const val CHANNEL_ID = "screen_capture_channel"
        const val NOTIFICATION_ID = 1
        var isServiceRunning = false
        var onServiceStarted: (() -> Unit)? = null
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = createNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                )
                isServiceRunning = true
                onServiceStarted?.invoke()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
            isServiceRunning = true
            onServiceStarted?.invoke()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        isServiceRunning = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Screen Capture Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Used for remote screen sharing"
            }
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("AnyLink")
            .setContentText("Screen sharing is active")
            .setSmallIcon(android.R.drawable.ic_menu_slideshow)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
