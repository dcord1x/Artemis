/**
 * Single global Maps API loader.
 *
 * useJsApiLoader is a singleton keyed on (id + options). Calling it from
 * multiple components with even slightly different options (different id,
 * different LIBRARIES reference, missing id) causes the loader to throw and
 * silently blank any page that mounts a map after the first loader.
 *
 * Solution: load the API exactly once here, at the app root, and expose
 * the ready-state via useMaps(). Every component that needs to know whether
 * the Maps SDK is ready imports useMaps() instead of calling useJsApiLoader.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY, LIBRARIES } from '../mapsConfig';

interface MapsContextValue {
  isLoaded: boolean;
  loadError: Error | undefined;
}

const MapsContext = createContext<MapsContextValue>({ isLoaded: false, loadError: undefined });

export function MapsProvider({ children }: { children: ReactNode }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });
  return (
    <MapsContext.Provider value={{ isLoaded, loadError }}>
      {children}
    </MapsContext.Provider>
  );
}

export const useMaps = () => useContext(MapsContext);
