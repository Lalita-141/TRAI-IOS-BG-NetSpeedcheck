import { Share, Alert, Platform } from 'react-native';
import { Sample } from '../types';

/**
 * Formats samples as standard CSV string
 */
export function generateCSV(samples: Sample[]): string {
  const headers = [
    'ID',
    'Timestamp',
    'Date_Time_ISO',
    'Carrier',
    'Network_Type',
    'Radio_Gen',
    'Download_Mbps',
    'Upload_Mbps',
    'Latency_ms',
    'Jitter_ms',
    'Packet_Loss_pct',
    'Location_Environment',
    'Latitude',
    'Longitude',
    'GPS_Accuracy_m',
    'Device_Model',
    'OS_Platform',
  ];

  const escapeCSV = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = samples.map(s => {
    const isoDate = new Date(s.ts * 1000).toISOString();
    return [
      escapeCSV(s.id),
      escapeCSV(s.ts),
      escapeCSV(isoDate),
      escapeCSV(s.carrier || ''),
      escapeCSV(s.network || ''),
      escapeCSV(s.radio || ''),
      escapeCSV(s.down_mbps != null ? s.down_mbps.toFixed(2) : ''),
      escapeCSV(s.up_mbps != null ? s.up_mbps.toFixed(2) : ''),
      escapeCSV(s.latency_ms != null ? s.latency_ms.toFixed(1) : ''),
      escapeCSV(s.jitter_ms != null ? s.jitter_ms.toFixed(1) : ''),
      escapeCSV(s.packet_loss_pct != null ? s.packet_loss_pct : '0'),
      escapeCSV(s.location_type || ''),
      escapeCSV(s.lat != null ? s.lat.toFixed(6) : ''),
      escapeCSV(s.lng != null ? s.lng.toFixed(6) : ''),
      escapeCSV(s.accuracy != null ? s.accuracy.toFixed(1) : ''),
      escapeCSV(s.device_model || ''),
      escapeCSV(s.os_platform || ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Exports test samples as a CSV file via native share sheet
 */
export async function exportSamplesAsCSV(samples: Sample[]): Promise<boolean> {
  if (samples.length === 0) {
    Alert.alert('Export Empty', 'There are no test history samples to export.');
    return false;
  }

  try {
    const csvContent = generateCSV(samples);
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `TRAI_SpeedTest_History_${dateStr}.csv`;

    await Share.share(
      Platform.select({
        ios: {
          title: filename,
          message: csvContent,
        },
        default: {
          title: filename,
          message: csvContent,
        },
      })
    );
    return true;
  } catch (err: any) {
    if (err?.message !== 'User did not share') {
      Alert.alert('Export Failed', err?.message || 'Could not export CSV data');
    }
    return false;
  }
}

/**
 * Exports test samples as JSON via native share sheet
 */
export async function exportSamplesAsJSON(samples: Sample[]): Promise<boolean> {
  if (samples.length === 0) {
    Alert.alert('Export Empty', 'There are no test history samples to export.');
    return false;
  }

  try {
    const jsonContent = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        totalSamples: samples.length,
        samples: samples,
      },
      null,
      2
    );
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `TRAI_SpeedTest_History_${dateStr}.json`;

    await Share.share({
      title: filename,
      message: jsonContent,
    });
    return true;
  } catch (err: any) {
    if (err?.message !== 'User did not share') {
      Alert.alert('Export Failed', err?.message || 'Could not export JSON data');
    }
    return false;
  }
}
