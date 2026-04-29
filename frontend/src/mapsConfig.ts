/**
 * Shared Google Maps loader configuration.
 *
 * Both MapView and GisMapModal must import LIBRARIES and GOOGLE_MAPS_API_KEY
 * from this module so useJsApiLoader receives the same array reference
 * on every call. Defining separate LIBRARIES arrays in each component causes
 * "@react-google-maps/api: Loader must not be called again with different options"
 * because the loader compares options by reference.
 */
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

export const LIBRARIES: ['places', 'visualization', 'drawing', 'geometry'] =
  ['places', 'visualization', 'drawing', 'geometry'];
