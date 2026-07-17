package expo.modules.banknotifications

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class BankNotificationsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BankNotifications")

    Events("onNotification", "onConnectionChange")

    Function("isPermissionGranted") {
      val context = appContext.reactContext ?: return@Function false
      val enabledListeners = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners"
      ) ?: return@Function false
      val componentName =
        "${context.packageName}/${BankNotificationListenerService::class.java.name}"
      enabledListeners.split(":").any { it == componentName }
    }

    Function("isListenerConnected") {
      BankNotificationListenerService.isConnected
    }

    Function("requestRebind") {
      val context = appContext.reactContext ?: return@Function false
      BankNotificationListenerService.requestRebind(context)
      true
    }

    Function("openPermissionSettings") {
      val context = appContext.reactContext
      if (context != null) {
        val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }

    Function("isBatteryOptimizationIgnored") {
      val context = appContext.reactContext ?: return@Function false
      val pm = context.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("requestIgnoreBatteryOptimizations") {
      val context = appContext.reactContext ?: return@Function false
      try {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
        intent.data = Uri.parse("package:${context.packageName}")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        true
      } catch (e: Throwable) {
        Log.e("BankNotifications", "requestIgnoreBatteryOptimizations failed", e)
        false
      }
    }

    OnStartObserving {
      val weakModule = WeakReference(this@BankNotificationsModule)
      BankNotificationListenerService.listener = { payload ->
        weakModule.get()?.sendEvent("onNotification", payload)
      }
      BankNotificationListenerService.connectionCallback = { connected ->
        weakModule.get()?.sendEvent("onConnectionChange", mapOf("connected" to connected))
      }

      // Drain any notifications that were buffered while JS wasn't observing
      val buffered = BankNotificationListenerService.drainBufferedNotifications()
      for (payload in buffered) {
        weakModule.get()?.sendEvent("onNotification", payload)
      }

      // If the service is already connected, notify JS immediately so it
      // doesn't wait for the first health check to discover the state.
      if (BankNotificationListenerService.isConnected) {
        weakModule.get()?.sendEvent("onConnectionChange", mapOf("connected" to true))
      }
    }

    OnStopObserving {
      BankNotificationListenerService.listener = null
      BankNotificationListenerService.connectionCallback = null
    }
  }
}
