import { getCurrentCars, getModelTrends } from "@/lib/data";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [cars, trends] = await Promise.all([getCurrentCars(), getModelTrends()]);
  return <Dashboard initialCars={cars} trends={trends} />;
}
