import express from 'express';
import cors from "cors"
import 'dotenv/config'
import { MongoClient } from 'mongodb';

const app = express();
const port = process.env.port || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Mongoose connection
const client = new MongoClient(process.env.MONGODB_URI);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const connectedClient = await connectToMongoDB();

app.get('/', (req, res) => {
  res.send({status: "success", message: "wedplan api is running"});
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});