import { MongoClient } from "mongodb";

const globalForMongo = globalThis as typeof globalThis & {
  papertrailMongoClient?: Promise<MongoClient>;
};

export async function getDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MongoDB is not configured.");

  globalForMongo.papertrailMongoClient ??= new MongoClient(uri, {
    maxPoolSize: 10,
  }).connect();

  const client = await globalForMongo.papertrailMongoClient;
  return client.db(process.env.MONGODB_DB || "papertrail");
}