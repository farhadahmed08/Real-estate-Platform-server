const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");

//middleware

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qaohrfy.mongodb.net/?retryWrites=true&w=majority`;
// const uri = "mongodb://0.0.0.0:27017/";

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

    const userCollection = client.db("realEstateDb").collection("users");
    const reviewCollection = client.db("realEstateDb").collection("reviews");
    const propertyCollection = client
      .db("realEstateDb")
      .collection("properties");
    const advertiseCollection = client
      .db("realEstateDb")
      .collection("advertise");
    const wishListCollection = client.db("realEstateDb").collection("wishList");
    const agentAddedItemsCollection = client
      .db("realEstateDb")
      .collection("agentAddedItems");

    //jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      // console.log(token)
      // res.send({token:token})
      res.send({ token }); //short hand
    });

    //middleware
    const verifyToken = (req, res, next) => {
      console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    //use verify admin after verifyToken

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    //use verify agent after verifyToken

    const verifyAgent = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAgent = user?.role === "agent";
      if (!isAgent) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //user related api
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded?.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.get("/users/agent/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded?.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let agent = false;
      if (user) {
        agent = user?.role === "agent";
      }
      res.send({ agent });
    });

    app.post(
      "/users",
      verifyToken,
      verifyAgent,
      verifyAdmin,
      async (req, res) => {
        const user = req.body;
        // insert email if user dosent exist
        // you can do this many ways (1.email unique, 2.upsert 3.simple checking)
        const query = { email: user.email };
        // console.log(query)
        const existingUser = await userCollection.findOne(query);
        if (existingUser) {
          return res.send({ message: "user already exists", insertedId: null });
        }

        const result = await userCollection.insertOne(user);
        res.send(result);
      }
    );

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.patch(
      "/users/agent/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "agent",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };

      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    //pagination
    app.get("/propertyCount", async (req, res) => {
      const count = await propertyCollection.estimatedDocumentCount();
      res.send({ count });
    });

    //properties

    app.get("/properties", async (req, res) => {
      const cursor = propertyCollection.find();

      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/properties", async (req, res) => {
      const page = parseInt(req.query.page);
      const size = parseInt(req.query.size);
      const filter = req.query;
      console.log(filter);
      const query = {
        //   // price:{$gt:10}

        title: { $regex: filter.search, $options: "i" },
      };
      const options = {
        //   // Sort matched documents in descending order by rating
        sort: {
          price: filter.sort === "asc" ? 1 : -1,
        },
      };

      const cursor = propertyCollection.find(query, options);

      const result = await cursor
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });

    app.get("/properties/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      console.log(query);
      const result = await propertyCollection.findOne(query);
      res.send(result);
    });

    app.post("/properties", verifyToken, async (req, res) => {
      const item = req.body;
      const result = await propertyCollection.insertOne(item);
      res.send(result);
    });

    app.delete(
      "/properties/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await propertyCollection.deleteOne(query);
        res.send(result);
      }
    );

    //advertise

    app.get("/advertise", async (req, res) => {
      const result = await advertiseCollection.find().toArray();
      res.send(result);
    });

    // wishlist
    app.get("/wishList", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await wishListCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/wishList", async (req, res) => {
      const wishListItem = req.body;
      const result = await wishListCollection.insertOne(wishListItem);
      res.send(result);
    });

    app.delete("/wishList/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await wishListCollection.deleteOne(query);
      res.send(result);
    });

    //reviews
    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    app.post("/reviews", async (req, res) => {
      const reviewsListItem = req.body;
      const result = await reviewCollection.insertOne(reviewsListItem);
      res.send(result);
    });

    app.delete("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await reviewCollection.deleteOne(query);
      res.send(result);
    });

    //agent added

    app.get("/myAdded", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await agentAddedItemsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/myAdded/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await agentAddedItemsCollection.findOne(query);
      res.send(result);
    });

    app.post("/myAdded", async (req, res) => {
      const agentAddedItem = req.body;
      const result = await agentAddedItemsCollection.insertOne(agentAddedItem);
      res.send(result);
    });

    app.patch("/myAdded/:id", async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          email: item.email,
          price: item.price,
          origin: item.origin,
          quantity: item.quantity,
          image: item.image,
        },
      };

      const result = await agentAddedItemsCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(result);
    });

    app.delete("/myAdded/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await agentAddedItemsCollection.deleteOne(query);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("real state sitting");
});

app.listen(port, () => {
  console.log(`Real State is sitting on port ${port}`);
});
