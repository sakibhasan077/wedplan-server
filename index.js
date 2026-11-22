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
const sessionCollection = db.collection("session");

app.get('/', (req, res) => {
  res.send({status: "success", message: "wedplan api is running"});
});

// Verify Token API
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).send({ message: 'Unauthorized' });
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    res.status(401).send({ message: 'Unauthorized' });
    return;
  }

  const session = await sessionCollection.findOne({ token });
  if (!session) {
    res.status(401).send({ message: 'Unauthorized' });
    return;
  }

  const user = await userCollection.findOne({ _id: new ObjectId(session.userId) });
  if (!user) {
    res.status(401).send({ message: 'Unauthorized' });
    return;
  }

  req.user = user;
  next()
}

// must call this middleware after verifyToken
const verifyCustomer = async (req, res, next) => {
  if (req.user.role !== 'customer') {
    res.status(403).send({ message: 'Forbidden' });
    return;
  }
  if (req.user.isBlocked) {
    return res.status(403).json({ message: "Forbidden: your account is blocked" });
  }
  next();
}
const verifyVendor = async (req, res, next) => {
  if (req.user.role !== 'vendor') {
    res.status(403).send({ message: 'Forbidden' });
    return;
  }
  if (req.user.isBlocked) {
    return res.status(403).json({ message: "Forbidden: your account is blocked" });
  }

  next();
}
const verifyAdmin = async (req, res, next) => {
  if (req.user.role !== 'admin') {
    res.status(403).send({ message: 'Forbidden' });
    return;
  }
  if (req.user.isBlocked) {
    return res.status(403).json({ message: "Forbidden: your account is blocked" });
  }
  next();
}

// Services API
//get all service data for admin (done)
app.get('/admin/services',verifyToken, verifyAdmin, async (req, res) => {
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
// Post a new service(done)
app.post('/services',verifyToken,verifyVendor, async (req, res) =>{
  const service = req.body;
  const serviceData = {
    status: "pending",
    isActive: true,
    ...service
  }
  const result = await servicesCollection.insertOne(serviceData);
  res.send(result);
}) 

// get all services for browse services page (done)
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

// service count (done)
app.get('/services/count', verifyToken, verifyVendor, async (req, res) => {
  const query = {};
  if(req.query.vendorId){
    query.vendorId = req.query.vendorId;
  }
  const count = await servicesCollection.countDocuments(query);
  res.send({count: count});
});

// Get Service Data by id(DONE)
app.get("/services/:id", verifyToken, async(req,res)=>{
   const { id } = req.params;
  const result = await servicesCollection.findOne({
    _id: new ObjectId(id)
  });

  res.send(result);
})

// Get services by vendor id (secure)
app.get('/services/vendor/:vendorId', verifyToken , verifyVendor, async (req, res) => {
  const{vendorId} = req.params;
  const services = await servicesCollection.findOne({vendorId});
  if(services.vendorId !== req.user._id.toString() && req.user.role !== "admin") {
    return res.status(403).send({message: "Forbidden: You are not authorized to access this resource."});
  }
  const result = await servicesCollection.find({vendorId}).sort({ createdAt: -1 }).toArray();
  res.send(result);
})

//Update service status by vendor(done)
app.patch('/services/:id', verifyToken, verifyVendor,  async (req, res) => {
  const {id} = req.params;
  const updateData = req.body;
  const result = await servicesCollection.updateOne({_id: new ObjectId(id)}, {$set: updateData});
  res.send(result);
})

// Delete service by id by vendor(done)
app.delete('/services/:id',verifyToken,verifyVendor,async(req,res)=>{
  const {id} = req.params;
  const result = await servicesCollection.deleteOne({_id: new ObjectId(id)})
  res.send(result)
})

//Update service status by admin (done)
app.patch('/services/:id/admin', verifyToken, verifyAdmin,  async (req, res) => {
  const {id} = req.params;
  const updateData = req.body;
  const result = await servicesCollection.updateOne({_id: new ObjectId(id)}, {$set: updateData});
  res.send(result);
})

// Delete service by id by admin (done)
app.delete('/services/:id/admin',verifyToken,verifyAdmin,async(req,res)=>{
  const {id} = req.params;
  const result = await servicesCollection.deleteOne({_id: new ObjectId(id)})
  res.send(result)
})
// User Collection 

app.get("/users",verifyToken,verifyAdmin,async(req,res)=>{
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
app.patch('/users/profile/:id',verifyToken, async (req, res) => {
  const {id} = req.params;
  const user = await userCollection.findOne({_id: new ObjectId(id)});
  if(req.user._id.toString() !== user._id.toString()) {
    return res.status(403).send({message: "Forbidden: You are not authorized to update this profile."});
  }
  const updateData = req.body;
  const result = await userCollection.updateOne({_id: new ObjectId(id)}, {$set: updateData});
  res.send(result); 
})

// update user IsBlocked status
app.patch('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
  const {id} = req.params;
  const updateData = req.body;
  const result = await userCollection.updateOne({_id: new ObjectId(id)}, {$set: updateData});
  res.send(result); 
})

// Get user by id
app.get('/users/brows-details/:id', verifyToken, verifyAdmin, async (req, res) => {
  const {id} = req.params;
  const result = await userCollection.findOne({_id: new ObjectId(id)});
  res.send(result);
})

// Payment API
app.post('/payment/checkout',verifyToken, verifyVendor, async (req, res) => {
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
app.get('/payments/history', verifyToken, verifyAdmin, async (req, res) => {
  const result = await paymentCollection.find({}).sort({ createdAt: -1 }).toArray();
  res.send(result);
})

// Booking related api 
app.post('/bookings', verifyToken, async (req, res) => {
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
    ...bookingData,
    status: "Pending",
    createdAt: new Date(),
  }
  const result = await bookingCollection.insertOne(data);
  res.send(result);
})

// get booking 
app.get(`/bookings/bookings/my`, verifyToken,verifyCustomer, async (req, res) => {
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

app.get(`/bookings/bookings/vendor`, verifyToken, verifyVendor, async (req, res) => {
  const {vendorId} = req.query; 
  if(!vendorId) {
    return res.status(400).send({message: "vendorId is required"});
  }
  if(!ObjectId.isValid(vendorId)) {
    return res.status(400).send({message: "Invalid vendorId"});
  }
  const result = await bookingCollection.find({vendorId}).sort({ createdAt: -1 }).toArray();
  res.send(result);

})

// cancel booking
app.delete('/bookings/:id/cancel', verifyToken, verifyCustomer, async (req, res) => {
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

// update booking status
app.patch('/bookings/:id/status', verifyToken, verifyVendor, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid booking ID" });
  }
  const result = await bookingCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status } });
  if (result.modifiedCount === 0) {
    return res.status(404).send({ message: "Booking not found" });
  }
  res.send({ message: "Booking status updated successfully" });
});

// dashboard admin overview api 
app.get("/api/admin/overview", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const [totalUsers, totalVendors, totalCustomers,
          totalServices, pendingServices, totalTransactions] = await Promise.all([
      userCollection.countDocuments(),
      userCollection.countDocuments({ role: "vendor" }),
      userCollection.countDocuments({ role: "customer" }),
      servicesCollection.countDocuments(),
      servicesCollection.countDocuments({ status: "pending" }),
      paymentCollection.countDocuments(),
    ]);

    res.json({ totalUsers, totalVendors, totalCustomers,
              totalServices, pendingServices, totalTransactions });
  } catch (error) {
  console.log("ERROR:", error);
  res.status(500).json({ message: "Failed to load overview" });
}
});

// dashboard vendor overview api
// dashboard vendor overview api
app.get("/api/vendor/overview", verifyToken, verifyVendor, async (req, res) => {
  try {
    // TODO: JWT যোগ হলে এটা হবে const vendorId = req.user.id;
    const { vendorId } = req.query;

    if (!vendorId || !ObjectId.isValid(vendorId)) {
      return res.status(400).json({ message: "Valid vendorId is required" });
    }

    const [
      totalServices,
      activeServices,
      pendingRequests,
      acceptedBookings,
      vendor,
    ] = await Promise.all([
      servicesCollection.countDocuments({ vendorId }),
      servicesCollection.countDocuments({
        vendorId,
        status: "approved",
        isActive: true,
      }),
      bookingCollection.countDocuments({
        vendorId,
        status: { $in: ["Pending", "pending"] },
      }),
      bookingCollection.countDocuments({ vendorId, status: "Accepted" }),
      userCollection.findOne(
        { _id: new ObjectId(vendorId) },
        { projection: { subscriptionPlan: 1 } }
      ),
    ]);

    res.json({
      totalServices,
      activeServices,
      pendingRequests,
      acceptedBookings,
      subscriptionPlan: vendor?.subscriptionPlan || "free",
    });
  } catch (error) {
    console.log("ERROR:", error);
    res.status(500).json({ message: "Failed to load vendor overview" });
  }
});

// dashboard customer overview api
app.get("/api/customer/overview", verifyToken, verifyCustomer, async (req, res) => {
  try {
    // TODO: JWT যোগ হলে এটা হবে const customerId = req.user.id;
    const { customerId } = req.query;

    if (!customerId) {
      return res.status(400).json({ message: "customerId is required" });
    }

    const [totalBookings, pendingBookings, acceptedBookings, rejectedBookings] =
      await Promise.all([
        bookingCollection.countDocuments({ customerId }),
        bookingCollection.countDocuments({
          customerId,
          status: { $in: ["Pending", "pending"] },
        }),
        bookingCollection.countDocuments({ customerId, status: "Accepted" }),
        bookingCollection.countDocuments({ customerId, status: "Rejected" }),
      ]);

    res.json({ totalBookings, pendingBookings, acceptedBookings, rejectedBookings });
  } catch (error) {
    console.log("ERROR:", error);
    res.status(500).json({ message: "Failed to load customer overview" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;