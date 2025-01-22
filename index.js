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
    const favoritesCollection = client
      .db("matchMateDB")
      .collection("favorites");
    const contactRequestCollection = client
      .db("matchMateDB")
      .collection("contactRequest");

    const paymentCollection = client.db("matchMateDB").collection("payments");

    // get all biodata
    app.get("/biodatas", async (req, res) => {
      const result = await biodataCollection.find().toArray();
      res.send(result);
    });

    // get specific biodata by id (params)

    app.get("/biodata/details/:biodataId", async (req, res) => {
      const biodataIdFromParams = req.params.biodataId;
      const biodataIntIdFromParams = parseInt(biodataIdFromParams);
      const { fields } = req.query;
      let projection = {};
      if (fields) {
        const fieldArray = fields.split(",");
        fieldArray.forEach((field) => {
          projection[field] = 1;
        });
      }

      const query = { biodataId: biodataIntIdFromParams };
      const result = await biodataCollection.findOne(query, { projection });

      res.send(result);
    });

    // get specific biodata by email (query)
    app.get("/biodata", async (req, res) => {
      const queryEmail = req.query.email;
      // console.log(queryEmail);
      const query = { userEmail: queryEmail };
      const result = await biodataCollection.findOne(query);
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
        // console.log("error from inside catch", error);
      }
    });

    // create contact request
    app.post("/contactRequest", async (req, res) => {
      const request = req.body;
      // console.log(request);
      const query = {
        biodataId: request.biodataId,
        userEmail: request.userEmail,
      };
      // const exist = await contactRequestCollection.findOne(query);
      // if (exist) {
      //   return res.send({ message: "You have already paid for this biodada" });
      // }
      const result = await contactRequestCollection.insertOne(request);
      res.send(result);
    });

    // get requested contacts for specific user by email
    app.get("/contactRequest", async (req, res) => {
      const userEmail = req.query.email;

      try {
        const result = await contactRequestCollection
          .aggregate([
            { $match: { userEmail } },
            {
              $addFields: {
                biodataIdInt: { $toInt: "$biodataId" },
              },
            },
            {
              $lookup: {
                from: "bioDatas",
                localField: "biodataIdInt",
                foreignField: "biodataId",
                as: "contactDetails",
              },
            },
            {
              $unwind: "$contactDetails",
            },
            {
              $project: {
                _id: 1,
                userEmail: 1,
                biodataId: 1,
                requestStatus: 1,
                name: "$contactDetails.personalInfo.name",
                phone: "$contactDetails.personalInfo.userPhone",
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        // console.log("error on catch", error);
        res.send({ message: "not found" });
      }
    });

    // delete requested contact by id
    app.delete("/contactRequest/:biodataId", async (req, res) => {
      const { biodataId } = req.params;
      const query = { biodataId: biodataId };
      const result = await contactRequestCollection.deleteOne(query);
      res.send(result);
    });

    // create payment
    app.post("/makePayment", async (req, res) => {
      const payment = req.body;
      // const query = {
      //   biodataId: payment.biodataId,
      //   userEmail: payment.userEmail,
      // };
      // const exist = await paymentCollection.findOne(query);
      // if (exist) {
      //   return res.send({ message: "Alredy Paid" });
      // }
      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    });

    // create favorotes biodata
    app.post("/favorites", async (req, res) => {
      const fvrtBiodata = req.body;
      // console.log(fvrtBiodata);
      const result = await favoritesCollection.insertOne(fvrtBiodata);
      res.send(result);
    });

    // get all fvrts by user email api
    app.get("/favorites", async (req, res) => {
      const { email } = req.query;
      const query = {
        userEmail: email,
      };
      const result = await favoritesCollection.find(query).toArray();
      res.send(result);
      // console.log(email);
    });

    // delete from fvrt by id and email
    app.delete("/favorite/delete", async (req, res) => {
      const { bioId, email } = req.query;
      
      const query = {
        biodataId: parseInt(bioId),
        userEmail: email,
      };
      const result = await favoritesCollection.deleteOne(query);
      res.send(result);
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
