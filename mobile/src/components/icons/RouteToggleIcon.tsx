import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

interface RouteToggleIconProps {
  width?: number;
  height?: number;
  color?: string;
}

const RouteToggleIcon: React.FC<RouteToggleIconProps> = ({ 
  width = 24, 
  height = 24, 
  color = 'black' 
}) => {
  return (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
      <Path 
        d="M21 3L14.5 21C14.3 21.6 13.7 22 13 22C12.3 22 11.7 21.6 11.5 21L3 3" 
        stroke={color} 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      <Circle cx="5" cy="3" r="3" fill={color} />
      <Circle cx="19" cy="3" r="3" fill={color} />
    </Svg>
  );
};

export default RouteToggleIcon;
