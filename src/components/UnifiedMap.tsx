"use client";

import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';

// Import the UnifiedMapProps type
import { UnifiedMapProps } from '@/types/emergency';

// Dynamically import the map component with no SSR
const MapComponent = dynamic(
  () => import('@/components/MapComponent'), 
  { 
    ssr: false,
    loading: () => <div style={{ height: '500px', width: '100%', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading map...</div>
  }
);

// Create a global counter to ensure each map instance has a unique ID
let mapInstanceCounter = 0;

const UnifiedMap = (props: UnifiedMapProps) => {
  const [isMounted, setIsMounted] = useState(false);
  
  // Generate a truly unique key for each instance that won't change on re-renders
  const instanceKey = useMemo(() => {
    mapInstanceCounter += 1;
    return `map-instance-${Date.now()}-${mapInstanceCounter}-${Math.random().toString(36).substring(2, 9)}`;
  }, []); // No dependencies needed here

  useEffect(() => {
    // Reset Leaflet's internal state before mounting
    if (typeof window !== 'undefined' && window.L) {
      // Reset Leaflet's internal counter to prevent ID conflicts
      // @ts-expect-error - Accessing Leaflet's internal property
      window.L._leaflet_id = 0;
      
      // Clean up any existing map containers
      const mapContainers = document.querySelectorAll('.leaflet-container');
      mapContainers.forEach(container => {
        // @ts-expect-error - Accessing Leaflet's internal property
        if (container._leaflet_id) {
          // @ts-expect-error - Accessing Leaflet's internal property
          container._leaflet = null;
          // @ts-expect-error - Accessing Leaflet's internal property
          container._leaflet_id = null;
        }
      });
    }
    
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      setIsMounted(true);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      setIsMounted(false);
      
      // Clean up any Leaflet map instances on unmount
      if (typeof window !== 'undefined') {
        // Reset Leaflet's internal counter
        // @ts-expect-error - Accessing Leaflet's internal property
        if (window.L) {
          // @ts-expect-error - Accessing Leaflet's internal property
          window.L._leaflet_id = 0;
        }
        
        // Remove any map instances that might be stored
        const leafletContainers = document.querySelectorAll('.leaflet-container');
        leafletContainers.forEach(container => {
          // Try to access the map instance and remove it
          // @ts-expect-error - Accessing Leaflet's internal property
          if (container._leaflet_id) {
            // @ts-expect-error - Accessing Leaflet's internal property
            container._leaflet = null;
            // @ts-expect-error - Accessing Leaflet's internal property
            container._leaflet_id = null;
          }
        });
      }
    };
  }, []); // Only run on mount/unmount

  if (!isMounted) {
    return <div style={{ height: '500px', width: '100%', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Preparing map...</div>;
  }

  // Use the key to force a complete remount of the component
  return <MapComponent key={instanceKey} {...props} />;
};

export default UnifiedMap;
