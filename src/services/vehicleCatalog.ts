export const vehicleCatalog: Record<string, string[]> = {
  Nissan: ['Versa', 'Sentra', 'March', 'Altima', 'Kicks', 'X-Trail', 'NP300'],
  Chevrolet: ['Aveo', 'Onix', 'Spark', 'Beat', 'Cavalier', 'Tracker', 'Silverado'],
  Volkswagen: ['Jetta', 'Vento', 'Virtus', 'Gol', 'Polo', 'Tiguan'],
  Toyota: ['Corolla', 'Yaris', 'Camry', 'Hilux', 'RAV4'],
  Honda: ['Civic', 'City', 'Accord', 'CR-V', 'HR-V'],
  Ford: ['Fiesta', 'Focus', 'Escape', 'Explorer', 'Ranger', 'F-150'],
  Mazda: ['2', '3', 'CX-3', 'CX-5', 'CX-30'],
  Kia: ['Rio', 'Forte', 'K3', 'Seltos', 'Sportage'],
  Hyundai: ['Grand i10', 'Accent', 'Elantra', 'Creta', 'Tucson'],
  Renault: ['Kwid', 'Logan', 'Duster', 'Oroch'],
  Suzuki: ['Swift', 'Baleno', 'Vitara', 'Jimny'],
  Mitsubishi: ['Mirage', 'L200', 'Outlander', 'Montero'],
  Dodge: ['Attitude', 'Journey', 'Durango', 'Charger'],
  Jeep: ['Renegade', 'Compass', 'Cherokee', 'Wrangler'],
  RAM: ['700', '1200', '1500', '2500'],
  BMW: ['Serie 1', 'Serie 3', 'X1', 'X3', 'X5'],
  'Mercedes-Benz': ['Clase A', 'Clase C', 'CLA', 'GLA', 'GLC'],
  Audi: ['A3', 'A4', 'Q3', 'Q5'],
};

export const vehicleBrands = Object.keys(vehicleCatalog);
export function getVehicleModels(make: string): string[] {
  return vehicleCatalog[make] ?? [];
}
