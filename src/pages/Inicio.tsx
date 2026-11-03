import { HeroBanner } from '../components/inicio/HeroBanner';
import { QuotesTable } from '../components/inicio/QuotesTable';
import '../styles/inicio.css';

export function Inicio() {
  return (
    <div className="inicio-page">
      <h1 className="sr-only">Inicio</h1>
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-5 pb-10 pt-6 sm:px-8 lg:px-14">
        <HeroBanner />
        <QuotesTable />
      </div>
    </div>
  );
}
