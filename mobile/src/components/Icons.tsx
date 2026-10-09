import React from 'react';
import Svg, { Path, Circle, Polyline, Rect, Line } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

export const LightningIcon: React.FC<IconProps> = ({ size = 20, color = '#00A389' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M13 2L3 14H12L11 22L21 10H12L13 2Z"
      fill={color}
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const BoltBadgeIcon: React.FC<IconProps> = ({ size = 18, color = '#F59E0B' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M13 2L4 13H11L10 22L20 10H13L13 2Z"
      fill={color}
      stroke={color}
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const DownloadIcon: React.FC<IconProps> = ({ size = 18, color = '#0284C7' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 4V16M12 16L7 11M12 16L17 11"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M5 20H19"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </Svg>
);

export const UploadIcon: React.FC<IconProps> = ({ size = 18, color = '#7C3AED' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 18V6M12 6L7 11M12 6L17 11"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M5 20H19"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </Svg>
);

export const ClockIcon: React.FC<IconProps> = ({ size = 18, color = '#D97706' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2.2" />
    <Polyline points="12 7 12 12 15 15" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const WaveformIcon: React.FC<IconProps> = ({ size = 18, color = '#DB2777' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 12H7L9 5L12 19L15 8L17 15L19 12H21"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const ShieldIcon: React.FC<IconProps> = ({ size = 18, color = '#059669' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 3L4 7V12C4 16.5 7.5 20.2 12 21C16.5 20.2 20 16.5 20 12V7L12 3Z"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Polyline points="9 12 11 14 15 10" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const AntennaIcon: React.FC<IconProps> = ({ size = 18, color = '#00A389' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 19V12" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    <Circle cx="12" cy="10" r="2" fill={color} />
    <Path d="M8.5 7.5C7 9 7 11.5 8.5 13" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M15.5 7.5C17 9 17 11.5 15.5 13" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M5.5 4.5C2.5 7.5 2.5 13 5.5 16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M18.5 4.5C21.5 7.5 21.5 13 18.5 16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M8 21H16" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
  </Svg>
);

export const PinIcon: React.FC<IconProps> = ({ size = 18, color = '#0284C7' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 21C12 21 19 14.5 19 9.5C19 5.6 15.9 2.5 12 2.5C8.1 2.5 5 5.6 5 9.5C5 14.5 12 21 12 21Z"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Circle cx="12" cy="9.5" r="2.8" fill={color} />
  </Svg>
);

export const ChevronRightIcon: React.FC<IconProps> = ({ size = 18, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Polyline points="9 6 15 12 9 18" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CloudCheckIcon: React.FC<IconProps> = ({ size = 16, color = '#00A389' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M7 18C4.2 18 2 15.8 2 13C2 10.4 4 8.2 6.5 8C7.5 4.5 10.7 2 14.5 2C19.2 2 23 5.8 23 10.5C23 11 22.9 11.5 22.8 12C21.2 12 19.8 12.8 19 14"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <Polyline points="9 16 12 19 18 13" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CloudUploadIcon: React.FC<IconProps> = ({ size = 16, color = '#D97706' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M7 18C4.2 18 2 15.8 2 13C2 10.4 4 8.2 6.5 8C7.5 4.5 10.7 2 14.5 2C19.2 2 23 5.8 23 10.5C23 12 22.5 13.5 21.5 14.6"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <Polyline points="12 13 12 21" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Polyline points="9 16 12 13 15 16" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const PlayIcon: React.FC<IconProps> = ({ size = 16, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M6 4L19 12L6 20V4Z" fill={color} />
  </Svg>
);

export const StopIcon: React.FC<IconProps> = ({ size = 16, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="5" y="5" width="14" height="14" rx="2" fill={color} />
  </Svg>
);

export const GaugeIcon: React.FC<IconProps> = ({ size = 16, color = '#1E293B' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 4C7.03 4 3 8.03 3 13C3 15.5 4.02 17.76 5.67 19.38"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <Path
      d="M18.33 19.38C19.98 17.76 21 15.5 21 13C21 8.03 16.97 4 12 4"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <Line x1="12" y1="13" x2="16" y2="9" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    <Circle cx="12" cy="13" r="2" fill={color} />
  </Svg>
);

export const MapNavIcon: React.FC<IconProps> = ({ size = 20, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9 18L3 21V6L9 3M9 18L15 21M9 18V3M15 21L21 18V3L15 6M15 21V6M15 6L9 3"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const HistoryNavIcon: React.FC<IconProps> = ({ size = 20, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 20V10" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    <Path d="M12 20V4" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    <Path d="M6 20V14" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

export const SettingsNavIcon: React.FC<IconProps> = ({ size = 20, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2" />
    <Path
      d="M19.4 15A1.65 1.65 0 0019 16.7L19.7 18.5C19.9 19 19.6 19.6 19.1 19.8L17.3 20.6C16.8 20.8 16.2 20.6 15.9 20.1L15.1 18.5A1.65 1.65 0 0013.3 17.7H10.7A1.65 1.65 0 008.9 18.5L8.1 20.1C7.8 20.6 7.2 20.8 6.7 20.6L4.9 19.8C4.4 19.6 4.1 19 4.3 18.5L5 16.7A1.65 1.65 0 004.6 15V15A1.65 1.65 0 002.9 14.2L1.1 13.9C0.6 13.8 0.2 13.3 0.2 12.8V11.2C0.2 10.7 0.6 10.2 1.1 10.1L2.9 9.8A1.65 1.65 0 004.6 9V9A1.65 1.65 0 005 7.3L4.3 5.5C4.1 5 4.4 4.4 4.9 4.2L6.7 3.4C7.2 3.2 7.8 3.4 8.1 3.9L8.9 5.5A1.65 1.65 0 0010.7 6.3H13.3A1.65 1.65 0 0015.1 5.5L15.9 3.9C16.2 3.4 16.8 3.2 17.3 3.4L19.1 4.2C19.6 4.4 19.9 5 19.7 5.5L19 7.3A1.65 1.65 0 0019.4 9V9A1.65 1.65 0 0021.1 9.8L22.9 10.1C23.4 10.2 23.8 10.7 23.8 11.2V12.8C23.8 13.3 23.4 13.8 22.9 13.9L21.1 14.2A1.65 1.65 0 0019.4 15V15Z"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const TargetLocateIcon: React.FC<IconProps> = ({ size = 18, color = '#1E293B' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth="2" />
    <Circle cx="12" cy="12" r="3" fill={color} />
    <Line x1="12" y1="2" x2="12" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="12" y1="19" x2="12" y2="22" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="2" y1="12" x2="5" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="19" y1="12" x2="22" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);
