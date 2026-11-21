import express, { application } from 'express';
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
const userCollection = db.collection("user");

app.get('/', (req, res) => {
  res.send({status: "success", message: "wedplan api is running"});
});

// Services API
//get all service data for admin 
app.get('/admin/services', async (req, res) => {
  const query = {};
  if(req.query.status){
    query.status = req.query.status;
  }
  if(req.query.category){
    query.category = req.query.category;
  }

  if(req.query.search){
    query.$or = [
      {serviceName: {$regex: req.query.search, $options: "i"}},
      {description: {$regex: req.query.search, $options: "i"}},
      {price: {$regex: req.query.search, $options: "i"}},
      {location: {$regex: req.query.search, $options: "i"}},
      {vendorName: {$regex: req.query.search, $options: "i"}},
      {vendorEmail: {$regex: req.query.search, $options: "i"}},
    ]
  }


  const result = await servicesCollection.find(query).sort({ createdAt: -1 }).toArray();
  res.send(result);
})
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

app.delete('/services/:id',async(req,res)=>{
  const {id} = req.params;
  const result = await servicesCollection.deleteOne({_id: new ObjectId(id)})
  res.send(result)
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// User Collection 

app.get("/users",async(req,res)=>{
  const query =  {}
  if(req.query.role){
    query.role = req.query.role;
  }
  if(req.query.search){
    query.$or = [
      {name: {$regex: req.query.search, $options: "i"}},
      {email: {$regex: req.query.search, $options: "i"}}
    ]
  }
  const result = await userCollection.find(query).toArray();
  res.send(result)
})

// update user IsBlocked status
app.patch('/users/:id', async (req, res) => {
  const {id} = req.params;
  const updateData = req.body;
  const result = await userCollection.updateOne({_id: new ObjectId(id)}, {$set: updateData});
  res.send(result); 
})