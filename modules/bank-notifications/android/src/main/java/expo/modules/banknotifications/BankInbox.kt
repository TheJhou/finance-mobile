package expo.modules.banknotifications

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Conteúdo de uma notificação capturada, antes de qualquer interpretação. */
data class CapturedNotification(
  val packageName: String,
  val sbnKey: String,
  val title: String,
  val text: String,
  val bigText: String?,
  val subText: String?,
  val textLines: List<String>,
  val postTime: Long,
  /** Notification.when: estável entre atualizações da mesma notificação. */
  val whenTime: Long,
)

/**
 * Fila de entrada durável das notificações de banco.
 *
 * Toda notificação capturada é gravada aqui ANTES de ir para o JS, e só sai
 * quando o JS confirma (ack) que a gravou no banco do app. Assim nada se perde
 * se o JS estiver pausado, ocupado ou morto, ou se o processo for encerrado.
 * O conteúdo é cifrado com uma chave do Android Keystore: o banco do app usa
 * SQLCipher e o texto das notificações não pode ficar em claro no disco.
 */
class BankInbox private constructor(context: Context) :
  SQLiteOpenHelper(context.applicationContext, DB_NAME, null, DB_VERSION) {

  private val appContext: Context = context.applicationContext

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE inbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_hash TEXT NOT NULL UNIQUE,
        package_name TEXT NOT NULL,
        post_time INTEGER NOT NULL,
        received_at INTEGER NOT NULL,
        encrypted INTEGER NOT NULL,
        payload BLOB NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0
      )
      """.trimIndent()
    )
    // Hashes já vistos: evitam duplicar a mesma notificação quando ela é
    // reapresentada (reconexão) ou atualizada sem mudar o conteúdo.
    db.execSQL("CREATE TABLE seen (hash TEXT PRIMARY KEY, seen_at INTEGER NOT NULL)")
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    if (oldVersion < 2) {
      // Tentativas do JS de gravar o item: o que sempre falha vai para o fim da fila
      db.execSQL("ALTER TABLE inbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0")
    }
  }

  /** Grava a notificação. Retorna false se ela já tinha sido capturada. */
  fun insert(n: CapturedNotification): Boolean {
    val content = listOf(n.packageName, n.title, n.text, n.bigText ?: "", n.subText ?: "", n.textLines.joinToString("\n"))
      .joinToString("\u0001")
    // Duas compras iguais têm "when" diferentes; a mesma notificação reapresentada tem o mesmo
    val contentHash = sha256("$content\u0001${if (n.whenTime > 0) n.whenTime else n.postTime}")
    // App que atualiza a notificação trocando o "when" mas sem mudar o texto
    val updateHash = sha256("update\u0001${n.sbnKey}\u0001$content")
    val now = System.currentTimeMillis()

    val db = writableDatabase
    db.beginTransaction()
    try {
      if (isSeen(db, contentHash, 0)) return false
      if (isSeen(db, updateHash, now - UPDATE_WINDOW_MS)) return false

      val (encrypted, payload) = seal(toJson(n).toString().toByteArray(Charsets.UTF_8))
      val values = ContentValues().apply {
        put("content_hash", contentHash)
        put("package_name", n.packageName)
        put("post_time", n.postTime)
        put("received_at", now)
        put("encrypted", if (encrypted) 1 else 0)
        put("payload", payload)
      }
      if (db.insertWithOnConflict("inbox", null, values, SQLiteDatabase.CONFLICT_IGNORE) == -1L) return false
      markSeen(db, contentHash, now)
      markSeen(db, updateHash, now)
      db.setTransactionSuccessful()
      return true
    } finally {
      db.endTransaction()
    }
  }

  /**
   * Itens ainda não confirmados pelo JS. Os que já falharam vão para o fim:
   * um item problemático não impede os outros de serem gravados.
   */
  fun pending(limit: Int): List<Map<String, Any?>> {
    // Notificações gravadas no plano B (quando esta fila falhou) entram agora
    migrateLegacyBuffer()

    val items = mutableListOf<Map<String, Any?>>()
    val unreadable = mutableListOf<Long>()
    readableDatabase.rawQuery(
      "SELECT id, content_hash, post_time, encrypted, payload, attempts FROM inbox ORDER BY attempts ASC, id ASC LIMIT ?",
      arrayOf(limit.toString())
    ).use { c ->
      while (c.moveToNext()) {
        val id = c.getLong(0)
        try {
          val raw = c.getBlob(4)
          val json = JSONObject(String(if (c.getInt(3) == 1) InboxCrypto.decrypt(raw) else raw, Charsets.UTF_8))
          items.add(fromJson(id, c.getString(1), c.getLong(2), c.getInt(5), json))
        } catch (e: Throwable) {
          // Chave do Keystore perdida (ex.: restauração do aparelho): não há como ler
          Log.e(TAG, "Item $id ilegível na fila de entrada — descartando", e)
          unreadable.add(id)
        }
      }
    }
    if (unreadable.isNotEmpty()) ack(unreadable)
    return items
  }

  fun ack(ids: List<Long>) {
    if (ids.isEmpty()) return
    val db = writableDatabase
    db.beginTransaction()
    try {
      for (id in ids) db.delete("inbox", "id = ?", arrayOf(id.toString()))
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
  }

  /** O JS não conseguiu gravar estes itens: conta a tentativa (vão para o fim da fila). */
  fun fail(ids: List<Long>) {
    if (ids.isEmpty()) return
    val db = writableDatabase
    db.beginTransaction()
    try {
      for (id in ids) db.execSQL("UPDATE inbox SET attempts = attempts + 1 WHERE id = ?", arrayOf<Any>(id))
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
  }

  fun count(): Int =
    readableDatabase.rawQuery("SELECT COUNT(*) FROM inbox", null).use { c -> if (c.moveToFirst()) c.getInt(0) else 0 }

  /**
   * Apaga os itens pendentes (saída ou troca de conta). Mantém os hashes já
   * vistos: senão, na próxima reconexão, as notificações antigas ainda na barra
   * voltariam como novas.
   */
  fun clear() {
    writableDatabase.delete("inbox", null, null)
    appContext.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE).edit().remove(LEGACY_KEY).commit()
  }

  /** Remove hashes antigos e itens que o JS nunca confirmou. */
  fun prune() {
    val now = System.currentTimeMillis()
    val db = writableDatabase
    db.delete("seen", "seen_at < ?", arrayOf((now - SEEN_RETENTION_MS).toString()))
    db.delete("inbox", "received_at < ?", arrayOf((now - INBOX_RETENTION_MS).toString()))
  }

  private fun isSeen(db: SQLiteDatabase, hash: String, since: Long): Boolean =
    db.rawQuery("SELECT 1 FROM seen WHERE hash = ? AND seen_at >= ?", arrayOf(hash, since.toString()))
      .use { it.moveToFirst() }

  private fun markSeen(db: SQLiteDatabase, hash: String, now: Long) {
    db.insertWithOnConflict(
      "seen", null,
      ContentValues().apply { put("hash", hash); put("seen_at", now) },
      SQLiteDatabase.CONFLICT_REPLACE
    )
  }

  /** Cifra o conteúdo. Se o Keystore falhar, grava em claro: perder a notificação é pior. */
  private fun seal(plain: ByteArray): Pair<Boolean, ByteArray> =
    try {
      true to InboxCrypto.encrypt(plain)
    } catch (e: Throwable) {
      Log.e(TAG, "Keystore indisponível — gravando sem cifra", e)
      false to plain
    }

  /**
   * Move para a fila o buffer em SharedPreferences: o de versões antigas do app
   * e o plano B usado quando a gravação na fila falha. O que não conseguir
   * entrar agora continua no buffer para a próxima vez.
   */
  private fun migrateLegacyBuffer() {
    synchronized(legacyLock) {
      val prefs = appContext.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)
      val raw = prefs.getString(LEGACY_KEY, null) ?: return
      val pending = try {
        JSONArray(raw)
      } catch (e: Throwable) {
        Log.e(TAG, "Buffer corrompido — descartando", e)
        prefs.edit().remove(LEGACY_KEY).commit()
        return
      }
      val remaining = JSONArray()
      for (i in 0 until pending.length()) {
        val item = pending.optJSONObject(i) ?: continue
        try {
          insert(capturedFromJson(item, "legacy-$i"))
        } catch (e: Throwable) {
          Log.e(TAG, "Falha ao migrar item do buffer — fica para depois", e)
          remaining.put(item)
        }
      }
      val editor = prefs.edit()
      if (remaining.length() == 0) editor.remove(LEGACY_KEY) else editor.putString(LEGACY_KEY, remaining.toString())
      editor.commit()
      if (pending.length() > 0) Log.i(TAG, "Buffer migrado: ${pending.length() - remaining.length()} de ${pending.length()}")
    }
  }

  companion object {
    private const val TAG = "BankInbox"
    private const val DB_NAME = "bank_inbox.db"
    private const val DB_VERSION = 2
    private const val UPDATE_WINDOW_MS = 2 * 60 * 1000L
    private const val SEEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000L
    private const val INBOX_RETENTION_MS = 90 * 24 * 60 * 60 * 1000L
    private const val LEGACY_PREFS = "bank_notifications_buffer"
    private const val LEGACY_KEY = "pending"
    private const val LEGACY_MAX_ITEMS = 500
    private val legacyLock = Any()

    @Volatile
    private var instance: BankInbox? = null

    fun get(context: Context): BankInbox =
      instance ?: synchronized(this) {
        instance ?: BankInbox(context).also {
          instance = it
          try { it.prune() } catch (e: Throwable) { Log.w(TAG, "prune falhou", e) }
        }
      }

    /**
     * Plano B: grava em SharedPreferences quando a fila (SQLite) falha, por
     * exemplo com o banco corrompido. O conteúdo fica em claro até ser migrado
     * para a fila, o que acontece na próxima leitura do JS.
     */
    fun bufferFallback(context: Context, n: CapturedNotification) {
      synchronized(legacyLock) {
        try {
          val prefs = context.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)
          val pending = JSONArray(prefs.getString(LEGACY_KEY, "[]"))
          if (pending.length() >= LEGACY_MAX_ITEMS) {
            Log.e(TAG, "Plano B cheio — notificação perdida (pkg=${n.packageName})")
            return
          }
          pending.put(toJson(n).put("whenTime", n.whenTime))
          prefs.edit().putString(LEGACY_KEY, pending.toString()).commit()
          Log.w(TAG, "Notificação gravada no plano B (pkg=${n.packageName})")
        } catch (e: Throwable) {
          Log.e(TAG, "Plano B também falhou — notificação perdida (pkg=${n.packageName})", e)
        }
      }
    }

    private fun sha256(value: String): String =
      MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }

    private fun toJson(n: CapturedNotification) = JSONObject().apply {
      put("packageName", n.packageName)
      put("sbnKey", n.sbnKey)
      put("title", n.title)
      put("text", n.text)
      put("bigText", n.bigText ?: JSONObject.NULL)
      put("subText", n.subText ?: JSONObject.NULL)
      put("textLines", JSONArray(n.textLines))
      put("postTime", n.postTime)
    }

    /** Lê um item do buffer (formato antigo, sem sbnKey/linhas/when, ou do plano B). */
    private fun capturedFromJson(item: JSONObject, fallbackKey: String): CapturedNotification {
      val postTime = item.optLong("postTime")
      val lines = item.optJSONArray("textLines") ?: JSONArray()
      return CapturedNotification(
        packageName = item.optString("packageName"),
        sbnKey = item.optString("sbnKey").ifEmpty { "$fallbackKey-$postTime" },
        title = item.optString("title"),
        text = item.optString("text"),
        bigText = if (item.isNull("bigText")) null else item.optString("bigText"),
        subText = if (item.isNull("subText")) null else item.optString("subText"),
        textLines = List(lines.length()) { lines.optString(it) },
        postTime = postTime,
        whenTime = item.optLong("whenTime", postTime),
      )
    }

    private fun fromJson(id: Long, contentHash: String, postTime: Long, attempts: Int, json: JSONObject): Map<String, Any?> {
      val lines = json.optJSONArray("textLines") ?: JSONArray()
      return mapOf(
        "id" to id,
        "contentHash" to contentHash,
        "packageName" to json.optString("packageName"),
        "title" to json.optString("title"),
        "text" to json.optString("text"),
        "bigText" to if (json.isNull("bigText")) null else json.optString("bigText"),
        "subText" to if (json.isNull("subText")) null else json.optString("subText"),
        "textLines" to List(lines.length()) { lines.optString(it) },
        "postTime" to postTime,
        "attempts" to attempts,
      )
    }
  }
}

/** AES-256-GCM com chave não exportável do Android Keystore. */
private object InboxCrypto {
  private const val ALIAS = "kilun_bank_inbox"
  private const val TRANSFORMATION = "AES/GCM/NoPadding"
  private const val IV_BYTES = 12

  private fun key(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return generator.generateKey()
  }

  fun encrypt(plain: ByteArray): ByteArray {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key())
    return cipher.iv + cipher.doFinal(plain)
  }

  fun decrypt(data: ByteArray): ByteArray {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data, 0, IV_BYTES))
    return cipher.doFinal(data, IV_BYTES, data.size - IV_BYTES)
  }
}
