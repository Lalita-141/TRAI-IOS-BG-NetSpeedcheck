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

export const SpeedTestIcon = LightningIcon;


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

export const ChevronLeftIcon: React.FC<IconProps> = ({ size = 18, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Polyline points="15 6 9 12 15 18" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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

export const VideoBrowserTestIcon: React.FC<IconProps> = ({ size = 18, color = '#334155' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="5" width="13" height="14" rx="2.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M15 10L21 6.5V17.5L15 14" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CoverageTestIcon: React.FC<IconProps> = ({ size = 18, color = '#334155' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="11" r="1.8" fill={color} />
    <Path d="M12 13V20" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M9 8.5C7.2 10.3 7.2 13.2 9 15" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M15 8.5C16.8 10.3 16.8 13.2 15 15" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M6 5.5C2.8 8.7 2.8 14.3 6 17.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M18 5.5C21.2 8.7 21.2 14.3 18 17.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const AdvanceTestsIcon: React.FC<IconProps> = ({ size = 18, color = '#334155' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M12 6.5V8.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M7.8 7.8L9.2 9.2" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M16.2 7.8L14.8 9.2" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="12" y1="12" x2="15.5" y2="8.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Circle cx="12" cy="12" r="2" fill={color} />
  </Svg>
);

export const SignalBarsIcon: React.FC<IconProps> = ({ size = 14, color = '#10B981' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 18V20M9 14V20M14 10V20M19 6V20" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

export const BackArrowIcon: React.FC<IconProps> = ({ size = 22, color = '#0F172A' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M19 12H5M5 12L12 19M5 12L12 5" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const StepperLatencyIcon: React.FC<IconProps> = ({ size = 20, color = '#1E293B' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 9H19M19 9L15 5M19 9L15 13" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M19 15H5M5 15L9 11M5 15L9 19" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const StepperDownloadIcon: React.FC<IconProps> = ({ size = 20, color = '#1E293B' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 4V16M12 16L7 11M12 16L17 11" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M5 19H19" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
  </Svg>
);

export const StepperUploadIcon: React.FC<IconProps> = ({ size = 20, color = '#1E293B' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 20V8M12 8L7 13M12 8L17 13" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M5 5H19" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
  </Svg>
);

export const GlobeIcon: React.FC<IconProps> = ({ size = 16, color = '#64748B' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
    <Path d="M3 12H21" stroke={color} strokeWidth="1.8" />
    <Path d="M12 3C14.5 6 16 9 16 12C16 15 14.5 18 12 21C9.5 18 8 15 8 12C8 9 9.5 6 12 3Z" stroke={color} strokeWidth="1.8" />
  </Svg>
);

export const CalendarIcon: React.FC<IconProps> = ({ size = 16, color = '#64748B' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="4" width="18" height="17" rx="2" stroke={color} strokeWidth="2" />
    <Line x1="16" y1="2" x2="16" y2="6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="8" y1="2" x2="8" y2="6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="3" y1="10" x2="21" y2="10" stroke={color} strokeWidth="1.8" />
  </Svg>
);

export const ServerIcon: React.FC<IconProps> = ({ size = 16, color = '#64748B' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="3" width="20" height="7" rx="2" stroke={color} strokeWidth="2" />
    <Rect x="2" y="14" width="20" height="7" rx="2" stroke={color} strokeWidth="2" />
    <Line x1="6" y1="6.5" x2="6.01" y2="6.5" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    <Line x1="6" y1="17.5" x2="6.01" y2="17.5" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

export const MySpeedLogo: React.FC<{ width?: number; height?: number }> = ({
  width = 180,
  height = 50,
}) => (
  <Svg width={width} height={height} viewBox="0 0 240 60" fill="none">
    {/* Speedometer Icon on left */}
    <Path
      d="M20 44C16.5 40 14 34.5 14 28C14 16.95 22.95 8 34 8C45.05 8 54 16.95 54 28C54 34.5 51.5 40 48 44"
      stroke="#1E293B"
      strokeWidth="4"
      strokeLinecap="round"
    />
    {/* Speedometer Radial Ticks */}
    <Line x1="20" y1="28" x2="25" y2="28" stroke="#0284C7" strokeWidth="2.5" strokeLinecap="round" />
    <Line x1="24" y1="18" x2="28" y2="21" stroke="#0284C7" strokeWidth="2.5" strokeLinecap="round" />
    <Line x1="34" y1="14" x2="34" y2="19" stroke="#0284C7" strokeWidth="2.5" strokeLinecap="round" />
    <Line x1="44" y1="18" x2="40" y2="21" stroke="#0284C7" strokeWidth="2.5" strokeLinecap="round" />
    {/* Gauge Needle */}
    <Line x1="34" y1="30" x2="25" y2="17" stroke="#EF4444" strokeWidth="3" strokeLinecap="round" />
    <Circle cx="34" cy="30" r="3.5" fill="#EF4444" />
    {/* Trailing speed speed-marks behind gauge */}
    <Line x1="48" y1="28" x2="56" y2="28" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
    <Line x1="47" y1="34" x2="54" y2="34" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
    <Line x1="45" y1="40" x2="51" y2="40" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />

    {/* "My" in Dark Slate */}
    <Path
      d="M74 42V18H80L87 33L94 18H100V42H95V26L89 39H85L79 26V42H74Z"
      fill="#0F172A"
    />
    <Path
      d="M104 25L110 42H105L102 33L99 42H94L100 25H104ZM106 44L104 49H99L102 44H106Z"
      fill="#0F172A"
    />

    {/* "Speed" in Amber / Yellow */}
    <Path
      d="M125 38C127 40 130 42 134 42C138 42 141 40 141 37C141 34 139 33 133 32C126 30 122 28 122 23C122 18 126 15 133 15C138 15 142 17 144 19L141 23C139 21 136 19 133 19C129 19 127 21 127 23C127 25 129 26 135 27C142 29 146 31 146 36C146 42 141 46 134 46C128 46 123 43 121 40L125 38Z"
      fill="#F5A623"
    />
    <Path
      d="M149 45V24H154V27C156 25 158 24 162 24C167 24 171 28 171 34C171 41 167 45 162 45C158 45 156 44 154 42V51H149V45ZM154 35C154 39 157 41 160 41C164 41 166 38 166 35C166 31 164 28 160 28C157 28 154 30 154 35Z"
      fill="#F5A623"
    />
    <Path
      d="M185 36H176C176 39 179 41 182 41C185 41 187 40 188 38L192 40C190 43 186 45 182 45C174 45 171 40 171 35C171 29 175 24 182 24C188 24 192 28 192 34V36H185ZM182 28C179 28 177 30 176 32H187C187 30 185 28 182 28Z"
      fill="#F5A623"
    />
    <Path
      d="M207 36H198C198 39 201 41 204 41C207 41 209 40 210 38L214 40C212 43 208 45 204 45C196 45 193 40 193 35C193 29 197 24 204 24C210 24 214 28 214 34V36H207ZM204 28C201 28 199 30 198 32H209C209 30 207 28 204 28Z"
      fill="#F5A623"
    />
    <Path
      d="M229 18V26C227 25 225 24 222 24C216 24 212 28 212 35C212 41 216 45 222 45C225 45 227 44 229 43V45H234V18H229ZM229 34C229 31 227 28 223 28C220 28 217 31 217 35C217 39 220 41 223 41C227 41 229 38 229 34Z"
      fill="#F5A623"
    />
  </Svg>
);

export const ContinuousRepeatIcon: React.FC<IconProps> = ({ size = 26, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M17 1l4 4-4 4"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M3 11V9a4 4 0 0 1 4-4h14"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M7 23l-4-4 4-4"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M21 13v2a4 4 0 0 1-4 4H3"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const ScheduleCalendarClockIcon: React.FC<IconProps> = ({ size = 26, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H12"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="M16 2V6M8 2V6M3 10H19" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="17.5" cy="17.5" r="4.5" stroke={color} strokeWidth="2" />
    <Polyline points="17.5 15.5 17.5 17.5 19 18.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const HourglassIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M6 2H18M6 22H18M7 2V6.5C7 8.985 9.239 11 12 11C14.761 11 17 8.985 17 6.5V2M7 22V17.5C7 15.015 9.239 13 12 13C14.761 13 17 15.015 17 17.5V22"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const StopwatchIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="13" r="8" stroke={color} strokeWidth="2" />
    <Path d="M12 9V13L14.5 14.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M12 5V2M10 2H14" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const RocketIcon: React.FC<IconProps> = ({ size = 20, color = '#0F172A' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M4.5 16.5C3.5 19.5 3 21 3 21C3 21 4.5 20.5 7.5 19.5M4.5 16.5L7.5 19.5M4.5 16.5L9 12M7.5 19.5L12 15"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M14.5 3.5C12 4.5 9 7.5 9 12L12 15C16.5 15 19.5 12 20.5 9.5C21 8.2 20.8 7 20 6.2C19.2 5.4 18 5.2 16.7 5.7"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Circle cx="15" cy="9" r="1.5" fill={color} />
  </Svg>
);

export const CloseIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CheckCircleIcon: React.FC<IconProps> = ({ size = 20, color = '#10B981' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2.2" />
    <Polyline points="8 12 11 15 16 9" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const RestartIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const SearchIcon: React.FC<IconProps> = ({ size = 18, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth="2.2" />
    <Path d="M20 20L16 16" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
  </Svg>
);

export const HomeIcon: React.FC<IconProps> = ({ size = 22, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 10.5L12 3L21 10.5V20C21 20.5523 20.5523 21 20 21H15V15H9V21H4C3.44772 21 3 20.5523 3 20V10.5Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const ChevronDownIcon: React.FC<IconProps> = ({ size = 16, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Polyline points="6 9 12 15 18 9" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ChevronUpIcon: React.FC<IconProps> = ({ size = 16, color = '#94A3B8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Polyline points="18 15 12 9 6 15" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const MapPinIcon: React.FC<IconProps> = ({ size = 20, color = '#0F172A' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 21C12 21 19 14.5 19 9.5C19 5.6 15.9 2.5 12 2.5C8.1 2.5 5 5.6 5 9.5C5 14.5 12 21 12 21Z"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Circle cx="12" cy="9.5" r="2.8" stroke={color} strokeWidth="2" />
  </Svg>
);

export const PlusIcon: React.FC<IconProps> = ({ size = 16, color = '#0F172A' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Line x1="12" y1="5" x2="12" y2="19" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    <Line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

export const MinusIcon: React.FC<IconProps> = ({ size = 16, color = '#0F172A' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

export const CrosshairIcon: React.FC<IconProps> = ({ size = 18, color = '#0F172A' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="7" stroke={color} strokeWidth="2" />
    <Circle cx="12" cy="12" r="2" fill={color} />
    <Line x1="12" y1="2" x2="12" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="12" y1="19" x2="12" y2="22" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="2" y1="12" x2="5" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="19" y1="12" x2="22" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const LanguageIcon: React.FC<IconProps> = ({ size = 20, color = '#00A389' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
    <Path d="M3.6 9H20.4M3.6 15H20.4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <Path d="M12 3C14.5 6 16 9 16 12C16 15 14.5 18 12 21C9.5 18 8 15 8 12C8 9 9.5 6 12 3Z" stroke={color} strokeWidth="1.8" />
  </Svg>
);

export const DataUsageIcon: React.FC<IconProps> = ({ size = 20, color = '#0284C7' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="2.5" fill={color} />
    <Path d="M8.5 8.5C6.5 10.5 6.5 13.5 8.5 15.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M15.5 8.5C17.5 10.5 17.5 13.5 15.5 15.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M5.5 5.5C2.5 8.5 2.5 15.5 5.5 18.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M18.5 5.5C21.5 8.5 21.5 15.5 18.5 18.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const FaqIcon: React.FC<IconProps> = ({ size = 20, color = '#00A389' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M21 11.5C21 16.1944 16.9706 20 12 20C10.5 20 9.1 19.6 7.8 19L3 20.5L4.5 16.2C3.5 14.8 3 13.2 3 11.5C3 6.80558 7.02944 3 12 3C16.9706 3 21 6.80558 21 11.5Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="M10 9C10 7.89543 10.8954 7 12 7C13.1046 7 14 7.89543 14 9C14 10.5 12 11 12 12.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Circle cx="12" cy="15.5" r="1" fill={color} />
  </Svg>
);

export const TutorialVideoIcon: React.FC<IconProps> = ({ size = 20, color = '#F59E0B' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="6" width="14" height="12" rx="3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M16 10L22 6.5V17.5L16 14" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const InfoCircleIcon: React.FC<IconProps> = ({ size = 20, color = '#0284C7' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
    <Line x1="12" y1="11" x2="12" y2="17" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    <Circle cx="12" cy="8" r="1.2" fill={color} />
  </Svg>
);

export const ShareAppIcon: React.FC<IconProps> = ({ size = 20, color = '#00A389' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 12V19C4 19.5523 4.44772 20 5 20H19C19.5523 20 20 19.5523 20 19V12" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Polyline points="16 6 12 2 8 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="12" y1="2" x2="12" y2="15" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const StarFeedbackIcon: React.FC<IconProps> = ({ size = 20, color = '#F59E0B' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const RateStoreIcon: React.FC<IconProps> = ({ size = 20, color = '#0284C7' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 7L12 3L19 7V19C19 19.5523 18.5523 20 18 20H6C5.44772 20 5 19.5523 5 19V7Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M9 11L12 14L15 11" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="12" y1="14" x2="12" y2="7" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const ExportTrayIcon: React.FC<IconProps> = ({ size = 20, color = '#00A389' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M21 15V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V15" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Polyline points="7 10 12 15 17 10" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Line x1="12" y1="15" x2="12" y2="3" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const TagLabelIcon: React.FC<IconProps> = ({ size = 20, color = '#0284C7' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M20.59 13.41L13.42 20.58C13.04 20.96 12.53 21.17 12 21.17C11.47 21.17 10.96 20.96 10.58 20.58L3 13V3H13L20.59 10.59C21.37 11.37 21.37 12.63 20.59 13.41Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Circle cx="7.5" cy="7.5" r="1.5" fill={color} />
  </Svg>
);

export const LockPrivacyIcon: React.FC<IconProps> = ({ size = 20, color = '#64748B' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="4" y="11" width="16" height="10" rx="3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M7 11V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V11" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="12" cy="16" r="1.5" fill={color} />
  </Svg>
);



