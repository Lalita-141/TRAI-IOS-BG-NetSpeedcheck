package com.example.speedmonitor

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.wifi.WifiManager
import android.os.Build
import android.telephony.CellIdentityNr
import android.telephony.CellInfo
import android.telephony.CellInfoGsm
import android.telephony.CellInfoLte
import android.telephony.CellInfoNr
import android.telephony.CellInfoWcdma
import android.telephony.CellSignalStrengthNr
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

/** Reads real radio values from the phone. Anything Android doesn't report stays null. */
class TelephonyModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  override fun getName() = "TelephonyModule"

  @ReactMethod
  fun getCellularInfo(promise: Promise) {
    val telephony = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    val hasLocation = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
      PackageManager.PERMISSION_GRANTED
    if (!hasLocation) {
      promise.resolve(buildResult(telephony, null))
      return
    }

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        telephony.requestCellInfoUpdate(
          context.mainExecutor,
          object : TelephonyManager.CellInfoCallback() {
            override fun onCellInfo(cellInfo: MutableList<CellInfo>) {
              promise.resolve(buildResult(telephony, cellInfo.firstOrNull { it.isRegistered }))
            }

            override fun onError(errorCode: Int, detail: Throwable?) {
              promise.resolve(buildResult(telephony, null))
            }
          },
        )
      } else {
        promise.resolve(buildResult(telephony, telephony.allCellInfo?.firstOrNull { it.isRegistered }))
      }
    } catch (e: SecurityException) {
      promise.resolve(buildResult(telephony, null))
    }
  }

  @ReactMethod
  fun getWifiInfo(promise: Promise) {
    val result = Arguments.createMap()
    try {
      val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION")
      val info = wifi.connectionInfo
      // -127 is Android's value for "no RSSI"
      putInt(result, "signalDbm", info?.rssi?.takeIf { it > -127 && it < 0 })
      result.putString("frequencyBand", info?.frequency?.takeIf { it > 0 }?.let { "$it MHz" })
    } catch (e: SecurityException) {
      result.putNull("signalDbm")
      result.putNull("frequencyBand")
    }
    promise.resolve(result)
  }

  private fun buildResult(telephony: TelephonyManager, cell: CellInfo?): WritableMap {
    val result = Arguments.createMap()
    result.putString("carrier", telephony.networkOperatorName?.takeIf { it.isNotBlank() })

    var radio: String? = null
    var dbm: Int? = null
    var tower: String? = null
    var band: String? = null

    when {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && cell is CellInfoNr -> {
        radio = "5G"
        val identity = cell.cellIdentity as CellIdentityNr
        dbm = (cell.cellSignalStrength as CellSignalStrengthNr).dbm
        tower = valid(identity.nci)?.let { "NCI $it" }
        band = bandName(identity, "n") ?: valid(identity.nrarfcn)?.let { "NRARFCN $it" }
      }
      cell is CellInfoLte -> {
        radio = "4G / LTE"
        dbm = cell.cellSignalStrength.dbm
        tower = valid(cell.cellIdentity.ci)?.let { "CI $it" }
        band = bandName(cell.cellIdentity, "Band ") ?: valid(cell.cellIdentity.earfcn)?.let { "EARFCN $it" }
      }
      cell is CellInfoWcdma -> {
        radio = "3G"
        dbm = cell.cellSignalStrength.dbm
        tower = valid(cell.cellIdentity.cid)?.let { "CID $it" }
        band = valid(cell.cellIdentity.uarfcn)?.let { "UARFCN $it" }
      }
      cell is CellInfoGsm -> {
        radio = "2G"
        dbm = cell.cellSignalStrength.dbm
        tower = valid(cell.cellIdentity.cid)?.let { "CID $it" }
        band = valid(cell.cellIdentity.arfcn)?.let { "ARFCN $it" }
      }
    }

    result.putString("radio", radio)
    putInt(result, "signalDbm", dbm?.let { valid(it) })
    result.putString("cellTower", tower)
    result.putString("frequencyBand", band)
    return result
  }

  private fun bandName(identity: Any, prefix: String): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
    val bands = when (identity) {
      is CellIdentityNr -> identity.bands
      is android.telephony.CellIdentityLte -> identity.bands
      else -> return null
    }
    return bands.firstOrNull()?.let { "$prefix$it" }
  }

  private fun valid(value: Int): Int? = value.takeIf { it != CellInfo.UNAVAILABLE }

  private fun valid(value: Long): Long? = value.takeIf { it != CellInfo.UNAVAILABLE_LONG }

  private fun putInt(map: WritableMap, key: String, value: Int?) {
    if (value != null) map.putInt(key, value) else map.putNull(key)
  }
}
