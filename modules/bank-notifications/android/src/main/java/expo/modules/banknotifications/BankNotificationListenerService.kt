package expo.modules.banknotifications

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class BankNotificationListenerService : NotificationListenerService() {

  override fun onListenerConnected() {
    Log.i(TAG, "Notification listener connected")
    isConnected = true
    lastConnectedAt = System.currentTimeMillis()
    connectionCallback?.invoke(true)

    // Reapresenta todas as notificações de banco ainda na barra: as que chegaram
    // enquanto o listener estava desconectado. A fila de entrada ignora as já vistas.
    try {
      val active = activeNotifications ?: emptyArray()
      for (sbn in active) onNotificationPosted(sbn)
    } catch (e: Throwable) {
      Log.w(TAG, "getActiveNotifications failed on connect", e)
    }
  }

  override fun onListenerDisconnected() {
    Log.w(TAG, "Notification listener disconnected — requesting rebind")
    isConnected = false
    lastDisconnectedAt = System.currentTimeMillis()
    connectionCallback?.invoke(false)
    // Pedido oficial de reconexão. Não desliga/religa o componente: isso
    // derrubava o próprio listener e perdia as notificações do intervalo.
    try {
      NotificationListenerService.requestRebind(ComponentName(this, BankNotificationListenerService::class.java))
    } catch (e: Throwable) {
      Log.e(TAG, "requestRebind on disconnect failed", e)
    }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (!isMonitored(applicationContext, sbn.packageName)) return
    val notification = sbn.notification ?: return
    // O resumo de grupo repete (ou resume) as notificações filhas, que já chegam separadas
    if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
    // Notificações fixas (ex.: "sincronizando") não são transações
    if (notification.flags and Notification.FLAG_ONGOING_EVENT != 0) return

    val captured = capture(sbn, notification) ?: return
    lastNotificationAt = System.currentTimeMillis()

    // Disco e Keystore fora da thread principal: ao reconectar, dezenas de
    // notificações podem ser reapresentadas de uma vez. Uma thread só mantém a ordem.
    val context = applicationContext
    captureExecutor.execute { store(context, captured) }
  }

  private fun store(context: Context, captured: CapturedNotification) {
    val stored = try {
      BankInbox.get(context).insert(captured)
    } catch (e: Throwable) {
      Log.e(TAG, "Falha ao gravar na fila de entrada (pkg=${captured.packageName}) — usando plano B", e)
      BankInbox.bufferFallback(context, captured)
      true
    }
    if (!stored) return

    try {
      inboxListener?.invoke()
    } catch (e: Throwable) {
      Log.e(TAG, "Error notifying JS about new inbox item", e)
    }
  }

  private fun capture(sbn: StatusBarNotification, notification: Notification): CapturedNotification? {
    val extras = notification.extras ?: return null
    val title = (extras.getCharSequence(Notification.EXTRA_TITLE) ?: extras.getCharSequence(Notification.EXTRA_TITLE_BIG))
      ?.toString().orEmpty()
    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
    val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
    val subText = listOfNotNull(
      extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString(),
      extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)?.toString(),
    ).filter { it.isNotBlank() }.distinct().joinToString(" | ").ifBlank { null }

    // Estilos em lista (InboxStyle) e conversa (MessagingStyle): quando o banco
    // agrupa lançamentos, os valores ficam só nestes campos
    val lines = mutableListOf<String>()
    extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.forEach { line ->
      line?.toString()?.takeIf { it.isNotBlank() }?.let(lines::add)
    }
    @Suppress("DEPRECATION")
    extras.getParcelableArray(Notification.EXTRA_MESSAGES)?.forEach { message ->
      (message as? Bundle)?.getCharSequence("text")?.toString()?.takeIf { it.isNotBlank() }?.let(lines::add)
    }

    if (title.isBlank() && text.isBlank() && bigText.isNullOrBlank() && lines.isEmpty()) return null

    return CapturedNotification(
      packageName = sbn.packageName,
      sbnKey = sbn.key,
      title = title,
      text = text,
      bigText = bigText,
      subText = subText,
      textLines = lines,
      postTime = sbn.postTime,
      whenTime = notification.`when`,
    )
  }

  companion object {
    private const val TAG = "BankNotifService"

    /** Grava as notificações capturadas, uma por vez, na ordem em que chegaram. */
    private val captureExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    /**
     * Apps monitorados. Fonte única: o JS lê esta lista com getMonitoredPackages().
     * Nomes de pacote conferidos com `adb shell pm list packages` num aparelho com o app.
     */
    val MONITORED_PACKAGES: Set<String> = setOf(
      // Bancos e contas digitais
      "com.nu.production",
      "br.com.intermedium",
      "com.picpay",
      "com.c6bank.app",
      "com.ctsi.android.app.privatelabel.c6bank",
      "com.mercadopago.wallet",
      "com.itau",
      "com.itau.empresas",
      "com.bradesco",
      "br.com.bradesco.next",
      "br.com.next",
      "com.santander.app",
      "br.com.bb.android",
      "br.com.gabba.Caixa",
      "br.gov.caixa.tem",
      "br.com.xp.carteira",
      "com.btg.pactual.banking",
      "com.btg.pactual.pdigital",
      "br.com.neon",
      "br.com.willbank",
      "com.recargapay",
      "com.ame.digital",
      "br.com.uol.ps.myaccount",
      "br.com.pagseguro.app",
      // Carteiras digitais (pagamento por aproximação)
      "com.google.android.apps.walletnfcrel",
      "com.samsung.android.spay",
    )

    /** Só em builds de desenvolvimento: permite testar com `adb shell cmd notification post`. */
    private const val ADB_SHELL_PACKAGE = "com.android.shell"

    fun isMonitored(context: Context, packageName: String): Boolean {
      if (packageName in MONITORED_PACKAGES) return true
      return packageName == ADB_SHELL_PACKAGE && isDebuggable(context)
    }

    fun monitoredPackages(context: Context): List<String> =
      if (isDebuggable(context)) MONITORED_PACKAGES.toList() + ADB_SHELL_PACKAGE else MONITORED_PACKAGES.toList()

    private fun isDebuggable(context: Context): Boolean =
      context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0

    @Volatile
    var isConnected: Boolean = false

    @Volatile
    var lastConnectedAt: Long = 0

    @Volatile
    var lastDisconnectedAt: Long = 0

    @Volatile
    var lastNotificationAt: Long = 0

    /** Avisa o JS que há itens novos na fila de entrada (sem payload: o JS lê a fila). */
    @Volatile
    var inboxListener: (() -> Unit)? = null

    @Volatile
    var connectionCallback: ((Boolean) -> Unit)? = null

    /** Pedido leve de reconexão, seguro para chamar a qualquer momento. */
    fun requestRebind(context: Context) {
      try {
        NotificationListenerService.requestRebind(ComponentName(context, BankNotificationListenerService::class.java))
      } catch (e: Throwable) {
        Log.e(TAG, "requestRebind failed", e)
      }
    }

    /**
     * Reparo forçado: desliga e religa o componente para o sistema recriar o
     * serviço. Derruba o listener por um instante, então só roda por ação do
     * usuário ("Reparar conexão"), nunca automaticamente.
     */
    fun repairConnection(context: Context) {
      val pm = context.packageManager
      val component = ComponentName(context, BankNotificationListenerService::class.java)
      try {
        pm.setComponentEnabledSetting(component, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
      } catch (e: Throwable) {
        Log.e(TAG, "repairConnection: disable failed", e)
      }
      Handler(Looper.getMainLooper()).postDelayed({
        try {
          pm.setComponentEnabledSetting(component, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
          NotificationListenerService.requestRebind(component)
          Log.i(TAG, "repairConnection: component toggled and rebind requested")
        } catch (e: Throwable) {
          Log.e(TAG, "repairConnection: enable/rebind failed", e)
        }
      }, 500)
    }
  }
}
