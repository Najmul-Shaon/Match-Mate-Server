const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SK);

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cwzf5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    //   all collections of database
    const biodataCollection = client.db("matchMateDB").collection("bioDatas");
    const usersCollection = client.db("matchMateDB").collection("users");
    // const counterCollection = client.db("matchMateDB").collection("counter");

    // get all biodata
    app.get("/biodatas", async (req, res) => {
      const result = await biodataCollection.find().toArray();
      res.send(result);
    });

    // get specific biodata by id (params)

    app.get("/biodata/details/:biodataId", async (req, res) => {
      const biodataIdFromParams = req.params.biodataId;
      const biodataIntIdFromParams = parseInt(biodataIdFromParams);
      const query = { biodataId: biodataIntIdFromParams };
      const result = await biodataCollection.find(query).toArray();
      res.send(result);
    });

    // get specific biodata by email (query)
    app.get("/biodata", async (req, res) => {
      const queryEmail = req.query.email;
      console.log(queryEmail);
      const query = { userEmail: queryEmail };
      const result = await biodataCollection.find(query).toArray();
      res.send(result);
    });

    //   create biodata
    app.post("/biodatas", async (req, res) => {
      try {
        const lastBiodata = await biodataCollection
          .find()
          .sort({ biodataId: -1 })
          .limit(1)
          .toArray();

        // generate new biodata id
        const newId = lastBiodata.length > 0 ? lastBiodata[0].biodataId + 1 : 1;

        // after creation biodata id, new biodata will be
        const newBiodata = {
          biodataId: newId,
          ...req.body,
        };
        const result = await biodataCollection.insertOne(newBiodata);
        res.send(result);
      } catch (error) {
        console.log("error from inside catch", error);
      }
    });

    //   create user
    app.post("/user", async (req, res) => {
      const user = req.body;
      // check user exist or not
      const query = { userEmail: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    //   payment gateway
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Match Mate Server is running");
});
app.listen(port, () => {
  console.log(`Server is running at ${port}`);
});
