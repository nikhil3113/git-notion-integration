const express = require("express");
const { Client } = require("@notionhq/client");

require("dotenv").config();

const app = express();

if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
  console.error(
    "Missing required environment variables: NOTION_API_KEY and/or NOTION_DATABASE_ID"
  );
  process.exit(1);
}

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Webhook is running");
});

app.post("/webhook", async (req, res) => {
  const payload = req.body;

  if (!payload.commits || !payload.repository) {
    return res.status(400).send("Invalid payload");
  }

  try {
    const repoName = payload.repository.name;

    for (const commit of payload.commits) {
      const message = commit.message;
      const url = commit.url;
      const author = commit.author.name;

      await notion.pages.create({
        parent: {
          database_id: process.env.NOTION_DATABASE_ID,
        },
        properties: {
          Name: {
            rich_text: [
              {
                text: { content: message },
              },
            ],
          },
          Author: {
            title: [
              {
                text: { content: author },
              },
            ],
          },
          Repository: {
            rich_text: [
              {
                text: { content: repoName },
              },
            ],
          },
          URL: {
            url: url,
          },
        },
      });
    }
    res.status(200).send("commit Sent to Notion");
  } catch (error) {
    console.error("Error processing webhook:", error);
    return res.status(500).send("Internal Server Error");
  }
});

app.listen(3005, () => {
  console.log("Server is running on port 3005");
});
