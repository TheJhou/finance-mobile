package expo.modules.banknotifications

import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class BankNotificationsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BankNotifications")

    Events("onInboxChanged", "onConnectionChange")

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

    Function("getListenerStatus") {
      mapOf(
        "connected" to BankNotificationListenerService.isConnected,
        "lastConnectedAt" to BankNotificationListenerService.lastConnectedAt,
        "lastDisconnectedAt" to BankNotificationListenerService.lastDisconnectedAt,
        "lastNotificationAt" to BankNotificationListenerService.lastNotificationAt,
      )
    }

    Function("getMonitoredPackages") {
      val context = appContext.reactContext ?: return@Function emptyList<String>()
      BankNotificationListenerService.monitoredPackages(context)
    }

    Function("requestRebind") {
      val context = appContext.reactContext ?: return@Function false
      BankNotificationListenerService.requestRebind(context)
      true
    }

    Function("repairConnection") {
      val context = appContext.reactContext ?: return@Function false
      BankNotificationListenerService.repairConnection(context)
      true
    }

    // ── Fila de entrada: o JS lê, grava no banco do app e só então confirma ──

    AsyncFunction("getInbox") { limit: Int ->
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      BankInbox.get(context).pending(limit.coerceIn(1, 200))
    }

    AsyncFunction("ackInbox") { ids: List<Double> ->
      val context = appContext.reactContext ?: return@AsyncFunction
      BankInbox.get(context).ack(ids.map { it.toLong() })
    }

    AsyncFunction("failInbox") { ids: List<Double> ->
      val context = appContext.reactContext ?: return@AsyncFunction
      BankInbox.get(context).fail(ids.map { it.toLong() })
    }

    AsyncFunction("clearInbox") {
      val context = appContext.reactContext ?: return@AsyncFunction
      BankInbox.get(context).clear()
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
      BankNotificationListenerService.inboxListener = {
        weakModule.get()?.sendEvent("onInboxChanged", emptyMap<String, Any?>())
      }
      BankNotificationListenerService.connectionCallback = { connected ->
        weakModule.get()?.sendEvent("onConnectionChange", mapOf("connected" to connected))
      }

      // Itens capturados enquanto o JS não observava: avisa para o JS ler a fila
      val context = appContext.reactContext
      val pending = try {
        if (context != null) BankInbox.get(context).count() else 0
      } catch (e: Throwable) {
        Log.e("BankNotifications", "Falha ao contar a fila de entrada", e)
        0
      }
      if (pending > 0) {
        weakModule.get()?.sendEvent("onInboxChanged", emptyMap<String, Any?>())
      }

      if (BankNotificationListenerService.isConnected) {
        weakModule.get()?.sendEvent("onConnectionChange", mapOf("connected" to true))
      }
    }

    OnStopObserving {
      BankNotificationListenerService.inboxListener = null
      BankNotificationListenerService.connectionCallback = null
    }
  }
}
