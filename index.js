import express from 'express';
import cors from "cors"
import 'dotenv/config'
import { MongoClient, ObjectId } from 'mongodb';
import Stripe from 'stripe';

// stripe 

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
const paymentCollection = db.collection("payment");
const bookingCollection = db.collection("booking");

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

// get all services for browse services page
app.get("/services/browse", async (req, res) => {
  try {
    const getQueryValue = (value) => Array.isArray(value) ? value[0] : value;
    const normalize = (value) =>
      typeof value === "string" ? value.trim() : undefined;
    const sort = normalize(getQueryValue(req.query.sort));
    const search = normalize(getQueryValue(req.query.search));
    const location = normalize(getQueryValue(req.query.location));
    const category = normalize(getQueryValue(req.query.category));
    const escapeRegex = (value) =>
      String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const query = { status: "approved", isActive: true };

    if (search) {
      const s = escapeRegex(search);
      query.$or = [
        { serviceName: { $regex: s, $options: "i" } },
        { vendorName: { $regex: s, $options: "i" } },
        { description: { $regex: s, $options: "i" } },
        { location: { $regex: s, $options: "i" } },
        { category: { $regex: s, $options: "i" } },
      ];
    }
    if (location && location.toLowerCase() !== "all") {
      query.location = { $regex: escapeRegex(location), $options: "i" };
    }
    if (category && category.toLowerCase() !== "all") {
      query.category = { $regex: `^${escapeRegex(category)}$`, $options: "i" };
    }

    const sortDirection = String(sort).toLowerCase();
    const sortOption =
      sortDirection === "asc" ||
      sortDirection === "low" ||
      sortDirection === "priceasc" ||
      sortDirection === "low-to-high"
        ? { price: 1 }
        : sortDirection === "desc" ||
            sortDirection === "high" ||
            sortDirection === "pricedesc" ||
            sortDirection === "high-to-low"
          ? { price: -1 }
          : { createdAt: -1 };

    const result = await servicesCollection.find(query).sort(sortOption).toArray();
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch services" });
  }
});

// service count 
app.get('/services/count', async (req, res) => {
  const query = {};
  if(req.query.vendorId){
    query.vendorId = req.query.vendorId;
  }
  const count = await servicesCollection.countDocuments(query);
  res.send({count: count});
});

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
  const result = await servicesCollection.find({vendorId}).sort({ createdAt: -1 }).toArray();
  res.send(result);
})

//Update service status
app.patch('/services/:id', async (req, res) => {
  const {id} = req.params;
  const updateData = req.body;
  const result = await servicesCollection.updateOne({_id: new ObjectId(id)}, {$set: updateData});
  res.send(result);
})

// Delete service by id
app.delete('/services/:id',async(req,res)=>{
  const {id} = req.params;
  const result = await servicesCollection.deleteOne({_id: new ObjectId(id)})
  res.send(result)
})
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
  const result = await userCollection.find(query).sort({ createdAt: -1 }).toArray();
  res.send(result)
})

// update user profile
app.patch('/users/profile/:id', async (req, res) => {
  const {id} = req.params;
  const updateData = req.body;
  const result = await userCollection.updateOne({_id: new ObjectId(id)}, {$set: updateData});
  res.send(result); 
})

// update user IsBlocked status
app.patch('/users/:id', async (req, res) => {
  const {id} = req.params;
  const updateData = req.body;
  const result = await userCollection.updateOne({_id: new ObjectId(id)}, {$set: updateData});
  res.send(result); 
})

// Get user by id
app.get('/users/brows-details/:id', async (req, res) => {
  const {id} = req.params;
  const result = await userCollection.findOne({_id: new ObjectId(id)});
  res.send(result);
})

// Payment API
app.post('/payment/checkout', async (req, res) => {
  const {sessionId} = req.body;
  if(!sessionId){
    return res.status(400).send({ error: "Session ID is required" });
  }
  const existingPayment = await paymentCollection.findOne({stripeSessionId: sessionId});
  if(existingPayment){
    return res.status(400).send({ error: "Payment already processed for this session" });
  }
  const {
    status,
    payment_status,
    payment_intent,
    customer_email,
    metadata,
    amount_total,
  } = await stripe.checkout.sessions.retrieve(sessionId);
  if(status === 'complete' && payment_status === 'paid') {
    const paymentData = {
      stripeSessionId: sessionId,
      status,
      payment_status,
      payment_intent,
      customer_email,
      vendorId: metadata.vendorId,
      vendorName: metadata.vendorName,
      vendorEmail: metadata.vendorEmail,
      amount_total,
      createdAt: new Date(),
      plan: "premium",
      amount: amount_total/100,
    };
    const result = await paymentCollection.insertOne(paymentData);
    const updateUser = await userCollection.updateOne({_id: new ObjectId(metadata.vendorId)}, {$set: {subscriptionPlan: "premium"}});
    res.send({result, updateUser});
  } else {
    res.status(400).send({ error: "Payment not completed or not paid" });
  }
});

// get all payments
app.get('/payments/history', async (req, res) => {
  const result = await paymentCollection.find({}).sort({ createdAt: -1 }).toArray();
  res.send(result);
})

// Booking related api 
app.post('/bookings', async (req, res) => {
  const bookingData = req.body;
  const {serviceId} = bookingData;
  if (!ObjectId.isValid(serviceId)) {
  return res.status(400).send({
    message: "Invalid service ID",
  });
  }
  const service = await servicesCollection.findOne({_id: new ObjectId(serviceId)});
  if (!service) {
    return res.status(404).send({
      message: "Service not found",
    });
  }
  if(service.status !== "approved" || !service.isActive) {
    return res.status(400).send({
      message: "Service is not available for booking",
    });
  }
  const data = {
    status: "pending",
    createdAt: new Date(),
    ...bookingData,
  }
  const result = await bookingCollection.insertOne(data);
  res.send(result);
})

// get booking 
app.get(`/bookings/bookings/my`, async (req, res) => {
  const {customerId} = req.query; 
  if(!customerId) {
    return res.status(400).send({message: "customerId is required"});
  }
  if(!ObjectId.isValid(customerId)) {
    return res.status(400).send({message: "Invalid customerId"});
  }
  const result = await bookingCollection.find({customerId}).sort({ createdAt: -1 }).toArray();
  res.send(result);

})

// cancel booking
app.delete('/bookings/:id/cancel', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid booking ID" });
  }
  const result = await bookingCollection.deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 0) {
    return res.status(404).send({ message: "Booking not found" });
  }
  res.send({ message: "Booking canceled successfully" });


});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;