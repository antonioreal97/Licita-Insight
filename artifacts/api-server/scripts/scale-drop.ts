import { dropScaleDatabase } from "./scale-db";

await dropScaleDatabase();
process.stdout.write("Dropped disposable database licita_scale\n");
