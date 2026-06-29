/**
 * TUI Components - Professional Unicode Aqua-Themed UI
 */

import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

/**
 * Animated water wave
 */
export function WaterWave({ frames = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] }: { frames?: string[] }) {
  const [frame, setFrame] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length);
    }, 100);
    return () => clearInterval(interval);
  }, [frames.length]);
  
  return (
    <Text color="cyan">
      {frames[frame]}{frames[(frame + 1) % frames.length]}{frames[(frame + 2) % frames.length]}
      {frames[(frame + 3) % frames.length]}{frames[(frame + 4) % frames.length]}
      {frames[(frame + 5) % frames.length]}{frames[(frame + 6) % frames.length]}
      {frames[(frame + 7) % frames.length]}
    </Text>
  );
}

/**
 * Professional box with water-themed borders - NO NESTED TEXT/BOX ISSUES
 */
export function WaterBox({ 
  title, 
  children, 
  width = 60 
}: { 
  title?: string;
  children: React.ReactNode;
  width?: number;
}) {
  const emptyLine = ' '.repeat(width - 2);
  
  return (
    <Box flexDirection="column" alignItems="center">
      {/* Top border */}
      <Text color="cyan">{'╔' + '═'.repeat(width - 2) + '╗'}</Text>
      
      {/* Title row */}
      {title && (
        <Text color="cyan">
          {'║'}
          <Text color="white">{' '.repeat(Math.floor((width - 2 - title.length) / 2))}</Text>
          <Text color="cyan" bold>{title}</Text>
          <Text color="white">{' '.repeat(Math.ceil((width - 2 - title.length) / 2))}</Text>
          {'║'}
        </Text>
      )}
      
      {/* Empty line */}
      <Text color="cyan">{'║'}<Text color="white">{emptyLine}</Text>{'║'}</Text>
      
      {/* Content row - children must be Text or fragments, NOT Box */}
      <Text color="cyan">
        {'║ '}
        {children}
        {' ║'}
      </Text>
      
      {/* Empty line */}
      <Text color="cyan">{'║'}<Text color="white">{emptyLine}</Text>{'║'}</Text>
      
      {/* Bottom border */}
      <Text color="cyan">{'╚' + '═'.repeat(width - 2) + '╝'}</Text>
    </Box>
  );
}

/**
 * Loading screen
 */
export function LoadingScreen({ message }: { message: string }) {
  return (
    <Box flexDirection="column" alignItems="center" marginTop={1}>
      <WaterWave />
      <Text color="cyan" bold>
        <Spinner type="dots" /> {message}
      </Text>
      <WaterWave />
    </Box>
  );
}

/**
 * Menu selector item
 */
export function MenuItem({ 
  label, 
  selected, 
  icon = '●' 
}: { 
  label: string;
  selected: boolean;
  icon?: string;
}) {
  if (selected) {
    return (
      <Text>
        <Text color="cyan" bold>  {icon} </Text>
        <Text color="cyan" bold>{label}</Text>
      </Text>
    );
  }
  return (
    <Text>
      <Text color="gray">    </Text>
      <Text color="gray">{label}</Text>
    </Text>
  );
}

/**
 * Step indicator
 */
export function StepIndicator({ 
  current, 
  total, 
  title 
}: { 
  current: number;
  total: number;
  title: string;
}) {
  const steps = [];
  for (let i = 1; i <= total; i++) {
    if (i === current) {
      steps.push(<Text key={i} color="cyan" bold>●</Text>);
    } else if (i < current) {
      steps.push(<Text key={i} color="green">✓</Text>);
    } else {
      steps.push(<Text key={i} color="gray">○</Text>);
    }
    if (i < total) {
      steps.push(<Text key={`sep-${i}`} color="gray"> → </Text>);
    }
  }
  
  return (
    <Box flexDirection="column" alignItems="center">
      <Text color="white">{steps}</Text>
      <Text color="cyan" bold>{title}</Text>
    </Box>
  );
}

/**
 * Message components - MUST be Text only, NO Box inside
 */
export function SuccessMessage({ message }: { message: string }) {
  return <Text color="green" bold>✓ {message}</Text>;
}

/**
 * Executes the error message operation.
 */
export function ErrorMessage({ message }: { message: string }) {
  return <Text color="red" bold>✗ {message}</Text>;
}

/**
 * Executes the info message operation.
 */
export function InfoMessage({ message }: { message: string }) {
  return <Text color="cyan" bold>Info: {message}</Text>;
}
