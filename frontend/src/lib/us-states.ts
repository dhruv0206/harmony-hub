// US States data with approximate centroids, population, and area
export const US_STATES: {
  abbr: string; name: string; lat: number; lng: number;
  population: number; area_sq_mi: number;
}[] = [
  { abbr: "AL", name: "Alabama", lat: 32.806671, lng: -86.79113, population: 5024279, area_sq_mi: 52420 },
  { abbr: "AK", name: "Alaska", lat: 63.588753, lng: -154.493062, population: 733391, area_sq_mi: 665384 },
  { abbr: "AZ", name: "Arizona", lat: 34.048928, lng: -111.093731, population: 7151502, area_sq_mi: 113990 },
  { abbr: "AR", name: "Arkansas", lat: 34.969704, lng: -92.373123, population: 3011524, area_sq_mi: 53179 },
  { abbr: "CA", name: "California", lat: 36.778261, lng: -119.417932, population: 39538223, area_sq_mi: 163695 },
  { abbr: "CO", name: "Colorado", lat: 39.550051, lng: -105.782067, population: 5773714, area_sq_mi: 104094 },
  { abbr: "CT", name: "Connecticut", lat: 41.603221, lng: -73.087749, population: 3605944, area_sq_mi: 5543 },
  { abbr: "DE", name: "Delaware", lat: 38.910832, lng: -75.52767, population: 989948, area_sq_mi: 2489 },
  { abbr: "FL", name: "Florida", lat: 27.664827, lng: -81.515754, population: 21538187, area_sq_mi: 65758 },
  { abbr: "GA", name: "Georgia", lat: 32.165622, lng: -82.900075, population: 10711908, area_sq_mi: 59425 },
  { abbr: "HI", name: "Hawaii", lat: 19.898682, lng: -155.665857, population: 1455271, area_sq_mi: 10932 },
  { abbr: "ID", name: "Idaho", lat: 44.068202, lng: -114.742041, population: 1839106, area_sq_mi: 83569 },
  { abbr: "IL", name: "Illinois", lat: 40.633125, lng: -89.398528, population: 12812508, area_sq_mi: 57914 },
  { abbr: "IN", name: "Indiana", lat: 40.267194, lng: -86.134902, population: 6785528, area_sq_mi: 36420 },
  { abbr: "IA", name: "Iowa", lat: 41.878003, lng: -93.097702, population: 3190369, area_sq_mi: 56273 },
  { abbr: "KS", name: "Kansas", lat: 39.011902, lng: -98.484246, population: 2937880, area_sq_mi: 82278 },
  { abbr: "KY", name: "Kentucky", lat: 37.839333, lng: -84.270018, population: 4505836, area_sq_mi: 40408 },
  { abbr: "LA", name: "Louisiana", lat: 30.984298, lng: -91.96233, population: 4657757, area_sq_mi: 52378 },
  { abbr: "ME", name: "Maine", lat: 45.253783, lng: -69.445469, population: 1362359, area_sq_mi: 35380 },
  { abbr: "MD", name: "Maryland", lat: 39.045755, lng: -76.641271, population: 6177224, area_sq_mi: 12406 },
  { abbr: "MA", name: "Massachusetts", lat: 42.407211, lng: -71.382437, population: 7029917, area_sq_mi: 10554 },
  { abbr: "MI", name: "Michigan", lat: 44.314844, lng: -85.602364, population: 10077331, area_sq_mi: 96714 },
  { abbr: "MN", name: "Minnesota", lat: 46.729553, lng: -94.6859, population: 5706494, area_sq_mi: 86936 },
  { abbr: "MS", name: "Mississippi", lat: 32.354668, lng: -89.398528, population: 2961279, area_sq_mi: 48432 },
  { abbr: "MO", name: "Missouri", lat: 37.964253, lng: -91.831833, population: 6154913, area_sq_mi: 69707 },
  { abbr: "MT", name: "Montana", lat: 46.879682, lng: -110.362566, population: 1084225, area_sq_mi: 147040 },
  { abbr: "NE", name: "Nebraska", lat: 41.492537, lng: -99.901813, population: 1961504, area_sq_mi: 77348 },
  { abbr: "NV", name: "Nevada", lat: 38.80261, lng: -116.419389, population: 3104614, area_sq_mi: 110572 },
  { abbr: "NH", name: "New Hampshire", lat: 43.193852, lng: -71.572395, population: 1377529, area_sq_mi: 9349 },
  { abbr: "NJ", name: "New Jersey", lat: 40.058324, lng: -74.405661, population: 9288994, area_sq_mi: 8723 },
  { abbr: "NM", name: "New Mexico", lat: 34.51994, lng: -105.87009, population: 2117522, area_sq_mi: 121590 },
  { abbr: "NY", name: "New York", lat: 43.299428, lng: -74.217933, population: 20201249, area_sq_mi: 54555 },
  { abbr: "NC", name: "North Carolina", lat: 35.759573, lng: -79.0193, population: 10439388, area_sq_mi: 53819 },
  { abbr: "ND", name: "North Dakota", lat: 47.551493, lng: -101.002012, population: 779094, area_sq_mi: 70698 },
  { abbr: "OH", name: "Ohio", lat: 40.417287, lng: -82.907123, population: 11799448, area_sq_mi: 44826 },
  { abbr: "OK", name: "Oklahoma", lat: 35.007752, lng: -97.092877, population: 3959353, area_sq_mi: 69899 },
  { abbr: "OR", name: "Oregon", lat: 43.804133, lng: -120.554201, population: 4237256, area_sq_mi: 98379 },
  { abbr: "PA", name: "Pennsylvania", lat: 41.203322, lng: -77.194525, population: 13002700, area_sq_mi: 46054 },
  { abbr: "RI", name: "Rhode Island", lat: 41.580095, lng: -71.477429, population: 1097379, area_sq_mi: 1545 },
  { abbr: "SC", name: "South Carolina", lat: 33.836081, lng: -81.163725, population: 5118425, area_sq_mi: 32020 },
  { abbr: "SD", name: "South Dakota", lat: 43.969515, lng: -99.901813, population: 886667, area_sq_mi: 77116 },
  { abbr: "TN", name: "Tennessee", lat: 35.517491, lng: -86.580447, population: 6910840, area_sq_mi: 42144 },
  { abbr: "TX", name: "Texas", lat: 31.968599, lng: -99.901813, population: 29145505, area_sq_mi: 268596 },
  { abbr: "UT", name: "Utah", lat: 39.32098, lng: -111.093731, population: 3271616, area_sq_mi: 84897 },
  { abbr: "VT", name: "Vermont", lat: 44.558803, lng: -72.577841, population: 643077, area_sq_mi: 9616 },
  { abbr: "VA", name: "Virginia", lat: 37.431573, lng: -78.656894, population: 8631393, area_sq_mi: 42775 },
  { abbr: "WA", name: "Washington", lat: 47.751074, lng: -120.740139, population: 7614893, area_sq_mi: 71298 },
  { abbr: "WV", name: "West Virginia", lat: 38.597626, lng: -80.454903, population: 1793716, area_sq_mi: 24230 },
  { abbr: "WI", name: "Wisconsin", lat: 43.78444, lng: -88.787868, population: 5893718, area_sq_mi: 65496 },
  { abbr: "WY", name: "Wyoming", lat: 43.075968, lng: -107.290284, population: 576851, area_sq_mi: 97813 },
  { abbr: "DC", name: "District of Columbia", lat: 38.9072, lng: -77.0369, population: 689545, area_sq_mi: 68 },
];

export function getStateByAbbr(abbr: string) {
  return US_STATES.find(s => s.abbr === abbr);
}

export function getStateByName(name: string) {
  return US_STATES.find(s => s.name.toLowerCase() === name.toLowerCase());
}
