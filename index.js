import express from 'express';
import cors from "cors"
import 'dotenv/config'
import { MongoClient, ObjectId } from 'mongodb';

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
const db = connectedClient.db("wedplan");
const servicesCollection = db.collection("services");

app.get('/', (req, res) => {
  res.send({status: "success", message: "wedplan api is running"});
});

// Services API
// Post a new service
app.post('/services', async (req, res) =>{
  const service = req.body;
  const serviceData = {
    status: "pending",
    isActive: true,
    ...service
  }
  const result = await servicesCollection.insertOne(serviceData);
  res.send(result);
}) 

// Get Service Data by id
app.get("/services/:id",async(req,res)=>{
   const { id } = req.params;
  const result = await servicesCollection.findOne({
    _id: new ObjectId(id)
  });

  res.send(result);
})

// Get services by vendor id
app.get('/services/vendor/:vendorId', async (req, res) => {
  const{vendorId} = req.params;
  const result = await servicesCollection.find({vendorId}).toArray();
  res.send(result);
})

//Update service status
app.patch('/services/:id', async (req, res) => {
  const {id} = req.params;
  const updateData = req.body;
  const result = await servicesCollection.updateOne({_id: new ObjectId(id)}, {$set: updateData});
  res.send(result);
})
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});