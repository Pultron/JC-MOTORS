import type { CustomerProfile } from '../models/quotation';

export const customerFixtures: CustomerProfile[] = [
  {
    id: 'customer-demo-carlos',
    name: 'Carlos Méndez',
    phone: '55 1234 5678',
    email: 'carlos@correo.com',
    aliases: [],
  },
  {
    id: 'customer-demo-chuy',
    name: 'Jesús Pérez',
    phone: '55 0000 1234',
    email: 'jesus.perez@example.com',
    aliases: ['Chuy'],
  },
  {
    id: 'customer-demo-mariana',
    name: 'Mariana López',
    phone: '55 1234 5678',
    email: 'mariana@example.com',
    aliases: ['Mari'],
  },
];
