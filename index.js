const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );

    //   all collections of database
    const biodataCollection = client.db("matchMateDB").collection("bioDatas");
    const usersCollection = client.db("matchMateDB").collection("users");
    const marriedCollection = client.db("matchMateDB").collection("married");
    const favoritesCollection = client
      .db("matchMateDB")
      .collection("favorites");
    const contactRequestCollection = client
      .db("matchMateDB")
      .collection("contactRequest");

    const paymentCollection = client.db("matchMateDB").collection("payments");
    const premiumRequestCollection = client
      .db("matchMateDB")
      .collection("premiumRequest");

    // jwt api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      // console.log("token from jwt ", token);
      res.send({ token });
    });

    // middleware
    const verifyToken = (req, res, next) => {
      // console.log(req.headers.authorization);
      if (!req.headers.authorization) {
        // console.log("error inside");
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = req.headers.authorization.split(" ")[1];
      // console.log(token);
      jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
        if (error) {
          // console.log("error inside error");
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // verify Admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { userEmail: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.userRole === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // get all biodata
    app.get("/biodatas", async (req, res) => {
      const {
        minAge,
        maxAge,
        biodataType,
        divisions,
        size,
        page,
        limit,
        biodataTypeWithLimit,
      } = req.query;

      const sizeInt = parseInt(size);
      const pageInt = parseInt(page);
      const limitInt = parseInt(limit);
      // console.log(pageInt, sizeInt);
      // console.log(biodataTypeWithLimit, limitInt);

      const query = {};

      if (minAge || maxAge) {
        query["personalInfo.age"] = {};
        if (minAge) {
          query["personalInfo.age"].$gte = minAge.toString();
        }
        if (maxAge) {
          query["personalInfo.age"].$lte = maxAge.toString();
        }
      }

      if (biodataType) {
        query["personalInfo.biodataType"] = { $in: biodataType.split(",") };
      }

      if (biodataTypeWithLimit && limitInt) {
        const result = await biodataCollection
          .find({
            "personalInfo.biodataType": biodataTypeWithLimit,
          })
          .limit(limitInt)
          .toArray();
        return res.send(result);
      }

      if (divisions) {
        query["personalInfo.address.permanent.division"] = {
          $in: divisions.split(","),
        };
      }
      const result = await biodataCollection
        .find(query)
        .skip(pageInt * sizeInt)
        .limit(sizeInt)
        .toArray();
      res.send(result);
    });

    // get biodata count based on filter value #public

    app.get("/biodataCounts", async (req, res) => {
      const { minAge, maxAge, biodataType, divisions } = req.query;

      const query = {};

      if (minAge || maxAge) {
        query["personalInfo.age"] = {};
        if (minAge) {
          query["personalInfo.age"].$gte = minAge.toString();
        }
        if (maxAge) {
          query["personalInfo.age"].$lte = maxAge.toString();
        }
      }

      if (biodataType) {
        query["personalInfo.biodataType"] = { $in: biodataType.split(",") };
      }

      if (divisions) {
        query["personalInfo.address.permanent.division"] = {
          $in: divisions.split(","),
        };
      }
      const count = await biodataCollection.countDocuments(query);

      res.send({ count });
    });

    // get specific biodata by id (params)
    // done: need to add token veirfy

    app.get("/biodata/details/:biodataId", verifyToken, async (req, res) => {
      // app.get("/biodata/details/:biodataId", async (req, res) => {
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
    // done: need to add token veirfy
    app.get("/biodata", verifyToken, async (req, res) => {
      // app.get("/biodata", async (req, res) => {
      const queryEmail = req.query.email;
      const query = { userEmail: queryEmail };
      const result = await biodataCollection.findOne(query);
      res.send(result);
    });

    //   create biodata
    // done: need to add token veirfy
    app.post("/biodatas", verifyToken, async (req, res) => {
      // app.post("/biodatas", async (req, res) => {
      try {
        const { userEmail } = req.body;
        const query = { userEmail: userEmail };

        const lastBiodata = await biodataCollection
          .find()
          .sort({ biodataId: -1 })
          .limit(1)
          .toArray();

        // generate new biodata id
        let newId = lastBiodata.length > 0 ? lastBiodata[0].biodataId + 1 : 1;
        let existId = await biodataCollection.findOne({ biodataId: newId });
        while (existId) {
          newId += 1;
          existId = await biodataCollection.findOne({ biodataId: newId });
        }
        const updateDoc = {
          $set: {
            biodataId: newId,
            ...req.body,
          },
        };

        const result = await biodataCollection.updateOne(query, updateDoc, {
          upsert: true,
        });
        res.send(result);
      } catch (error) {}
    });
    // ***********************************************
    // featured profile (premium profile:max 6) public
    // ***********************************************
    app.get("/premiumProfile", async (req, res) => {
      const { sortby } = req.query;
      const premiumUser = await usersCollection
        .find({ userRole: "premium" })
        .toArray();
      const premiumUsersEmail = premiumUser.map((user) => user.userEmail);

      const setOrder = sortby === "asc" ? 1 : -1;

      const premiumBiodata = await biodataCollection
        .find({
          userEmail: { $in: premiumUsersEmail },
        })
        .sort({ "personalInfo.age": setOrder })
        .limit(6)
        .toArray();
      res.send(premiumBiodata);
    });
    // ***********************************************
    // count biodata public
    app.get("/biodataCount", async (req, res) => {
      const totalBiodata = await biodataCollection.estimatedDocumentCount();
      const totalMaleBiodata = await biodataCollection.countDocuments({
        "personalInfo.biodataType": "Male",
      });
      const totalFemaleBiodata = await biodataCollection.countDocuments({
        "personalInfo.biodataType": "Female",
      });
      const premiumUsers = await usersCollection
        .find({ userRole: "premium" })
        .toArray();
      const premiumUsersId = premiumUsers.map(
        (premiumUser) => premiumUser.userEmail
      );
      const totalPremiumBiodata = await biodataCollection.countDocuments({
        userEmail: { $in: premiumUsersId },
      });
      const totalAmount = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalAmount: { $sum: "$amount" },
            },
          },
        ])
        .toArray();
      const amount = totalAmount.length > 0 ? totalAmount[0].totalAmount : 0;

      const totalMarried = await marriedCollection.estimatedDocumentCount();
      const result = {
        totalBiodata,
        totalMaleBiodata,
        totalFemaleBiodata,
        totalPremiumBiodata,
        amount,
        totalMarried,
      };
      res.send(result);
    });
    // ***********************************************

    // create contact request #private
    // done: need to add token veirfy
    app.post("/contactRequest", verifyToken, async (req, res) => {
      // app.post("/contactRequest", async (req, res) => {
      const request = req.body;
      const query = {
        biodataId: request.biodataId,
        userEmail: request.userEmail,
      };

      const result = await contactRequestCollection.insertOne(request);
      res.send(result);
    });

    // get requested contacts for specific user by email or if email not provided
    // done: need to add token veirfy
    app.get("/contactRequest", verifyToken, async (req, res) => {
      // app.get("/contactRequest", async (req, res) => {
      const userEmail = req.query.email;

      const query = {
        requestStatus: "pending",
      };

      try {
        if (!userEmail) {
          const result = await contactRequestCollection.find(query).toArray();
          return res.send(result);
        }
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
        res.send({ message: "not found" });
      }
    });

    // delete requested contact by id
    // done: need to add token veirfy
    app.delete("/contactRequest/:biodataId", verifyToken, async (req, res) => {
      // app.delete("/contactRequest/:biodataId", async (req, res) => {
      const { biodataId } = req.params;
      const query = { biodataId: biodataId };
      const result = await contactRequestCollection.deleteOne(query);
      res.send(result);
    });

    // update contact request (approved) admin
    // done: need to add token & admin veirfy
    app.patch(
      "/update/contactRequest/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const query = {
          biodataId: id,
        };
        const updateDoc = {
          $set: {
            requestStatus: "approved",
          },
        };

        const result = await contactRequestCollection.updateOne(
          query,
          updateDoc
        );
        res.send(result);
      }
    );

    // check contact request is exit or not #user
    // done: need to add token veirfy
    app.get("/check/requestContact", verifyToken, async (req, res) => {
      // app.get("/check/requestContact", async (req, res) => {
      const { id, email } = req.query;
      const query = {
        biodataId: id,
        userEmail: email,
      };

      const result = await contactRequestCollection.findOne(query);
      // console.log(typeof id, email, result);
      let requested = false;
      if (result) {
        requested = true;
      }
      res.send({ requested });
    });

    // create make premium biodata #user
    // done: need to add token veirfy
    app.post("/premiumRequest", verifyToken, async (req, res) => {
      // app.post("/premiumRequest", async (req, res) => {
      const biodataInfo = req.body;
      const result = await premiumRequestCollection.insertOne(biodataInfo);
      res.send(result);
    });

    // get all premium biodata (for admin)
    // done: need to add token & admin veirfy
    app.get("/premiumRequest", verifyToken, verifyAdmin, async (req, res) => {
      // app.get("/premiumRequest", async (req, res) => {
      const query = {
        status: "pending",
      };
      const result = await premiumRequestCollection.find(query).toArray();
      res.send(result);
    });

    // delete individual premium request #admin
    // done: need to add token & admin veirfy
    app.delete(
      "/delete/premiumRequest/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = {
          biodataId: parseInt(id),
        };
        const result = await premiumRequestCollection.deleteOne(query);
        res.send(result);
      }
    );

    // update status of premium request #admin
    // done: need to add token & admin veirfy
    app.patch(
      "/update/premiumRequest/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = {
          biodataId: parseInt(id),
        };
        const updateDoc = {
          $set: {
            status: "approved",
          },
        };
        const result = await premiumRequestCollection.updateOne(
          query,
          updateDoc
        );
        res.send(result);
      }
    );

    // create payment
    // done: need to add token veirfy
    app.post("/makePayment", verifyToken, async (req, res) => {
      // app.post("/makePayment", async (req, res) => {
      const payment = req.body;

      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    });

    // create favorotes biodata
    // done: need to add token veirfy
    app.post("/favorites", verifyToken, async (req, res) => {
      // app.post("/favorites", async (req, res) => {
      const fvrtBiodata = req.body;
      const result = await favoritesCollection.insertOne(fvrtBiodata);
      res.send(result);
    });

    // get all fvrts by user email api
    // done: need to add token veirfy
    app.get("/favorites", verifyToken, async (req, res) => {
      // app.get("/favorites", async (req, res) => {
      const { email } = req.query;
      const query = {
        userEmail: email,
      };
      const result = await favoritesCollection.find(query).toArray();
      res.send(result);
    });

    // delete from fvrt by id and email
    // done: need to add token veirfy
    app.delete("/favorite/delete", verifyToken, async (req, res) => {
      // app.delete("/favorite/delete", async (req, res) => {
      const { bioId, email } = req.query;

      const query = {
        biodataId: parseInt(bioId),
        userEmail: email,
      };
      const result = await favoritesCollection.deleteOne(query);
      res.send(result);
    });

    // check: already added into favorites or not #user
    // done: need to add token veirfy
    app.get("/check/favorite", verifyToken, async (req, res) => {
      // app.get("/check/favorite", async (req, res) => {
      const { id, email } = req.query;

      const query = {
        biodataId: parseInt(id),
        userEmail: email,
      };

      const result = await favoritesCollection.findOne(query);

      let isFavorite = false;
      if (result) {
        isFavorite = true;
      }

      // console.log(typeof id, email, result);
      res.send({ isFavorite });
    });

    // create success story
    // done: need to add token veirfy
    app.post("/successStory", verifyToken, async (req, res) => {
      // app.post("/successStory", async (req, res) => {
      const story = req.body;
      const result = await marriedCollection.insertOne(story);
      res.send(result);
    });

    // get success story #public
    app.get("/successStory", async (req, res) => {
      const result = await marriedCollection
        .find()
        .sort({
          marriageDate: 1,
        })
        .toArray();
      res.send(result);
    });

    // delete success story
    // done: need to add token & admin veirfy
    app.delete(
      "/successStory/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await marriedCollection.deleteOne(query);
        res.send(result);
      }
    );

    //   create user #public
    app.post("/user", async (req, res) => {
      const user = req.body;
      // check user exist or not
      const query = { userEmail: user.userEmail };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // get all users #admin
    // done: need to add token & admin veirfy
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      // app.get("/users", async (req, res) => {
      const { search } = req.query;
      const query = {
        userName: { $regex: search, $options: "i" },
      };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    // check isAdmin
    // done: need to umcomment
    // done: need to add token veirfy
    app.get("/user/admin/:email", verifyToken, async (req, res) => {
      // app.get("/user/admin/:email", async (req, res) => {
      const email = req.params.email;
      // console.log(email);
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { userEmail: email };
      const user = await usersCollection.findOne(query);
      let isAdmin = false;
      if (user) {
        isAdmin = user?.userRole === "admin";
      }
      res.send({ isAdmin });
    });

    // check is premium
    // done: need to add token veirfy
    app.get("/user/premium/:email", verifyToken, async (req, res) => {
      // app.get("/user/premium/:email", async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { userEmail: email };
      const user = await usersCollection.findOne(query);
      let isPremium = false;
      if (user) {
        isPremium = user?.userRole === "premium";
      }
      res.send({ isPremium });
    });

    // delete user
    // done: need to add token & admin veirfy
    app.delete("/delete/user", verifyToken, verifyAdmin, async (req, res) => {
      // app.delete("/delete/user", async (req, res) => {
      const { targetEmail, user } = req.query;
      const query = {
        userEmail: targetEmail,
      };
      if (user === targetEmail) {
        return res.send({ message: "Same user" });
      }
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    // update user role
    // done: need to add token & admin veirfy
    app.patch(
      "/user/role/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { role } = req.query;
        const { email } = req.params;
        const query = {
          userEmail: email,
        };
        if (role === "admin") {
          const updateDoc = {
            $set: {
              userRole: "admin",
            },
          };
          const result = await usersCollection.updateOne(query, updateDoc);
          return res.send(result);
        } else if (role === "premium") {
          const updateDoc = {
            $set: {
              userRole: "premium",
            },
          };
          const result = await usersCollection.updateOne(query, updateDoc);
          res.send(result);
        }
      }
    );

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
