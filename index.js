const express = require("express");
const { Client } = require("@notionhq/client");
const { google } = require("googleapis");

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
  const event = req.headers["x-github-event"];

  console.log(`Received GitHub ${event} event`);

  // Handle the initial ping event when webhook is first configured
  if (event === "ping") {
    console.log("Ping received from GitHub!");
    return res.status(200).send("Webhook configured successfully");
  }

  // Handle push events with commits
  if (event === "push") {
    if (!payload.commits || !payload.repository) {
      return res.status(400).send("Invalid payload");
    }

    try {
      const repoName = payload.repository.name;
      console.log(
        `Processing ${payload.commits.length} commits from ${repoName}`
      );

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
            Commit_Date: {
              date: {
                start: new Date(commit.timestamp).toISOString(),
              },
            },
          },
        });
      }
      res.status(200).send("Commits sent to Notion");
    } catch (error) {
      console.error("Error processing webhook:", error);
      return res.status(500).send("Internal Server Error");
    }
  } else {
    // Other event types that we're not handling
    return res.status(200).send("Event received but not processed");
  }
});

app.post("/github-to-sheets", async (req, res) => {
  try {
    const event = req.headers["x-github-event"];
    if (event === "ping") {
      console.log("Ping received from GitHub!");
      return res.status(200).send("Webhook configured successfully");
    }

    let parsedCredentials;
    try {
      if (
        typeof process.env.GOOGLE_APPLICATION_CREDENTIALS === "string" &&
        process.env.GOOGLE_APPLICATION_CREDENTIALS.trim().startsWith("{")
      ) {
        parsedCredentials = JSON.parse(
          process.env.GOOGLE_APPLICATION_CREDENTIALS
        );
      }
    } catch (parseError) {
      console.error("Error parsing credentials JSON:", parseError);
      return res.status(500).send("Failed to parse credentials");
    }

    const auth = new google.auth.GoogleAuth({
      credentials: parsedCredentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const payload = req.body;

    if (event === "push") {
      if (!payload.commits || !payload.repository) {
        return res.status(400).send("Invalid payload");
      }
      const repoName = payload.repository.name;
      console.log(
        `Processing ${payload.commits.length} commits from ${repoName}`
      );

      const rows = payload.commits.map((commit) => {
        // Determine type based on commit message content
        let type = "Frontend"; // Default
        if (commit.message.toLowerCase().includes("backend")) {
          type = "Backend";
        } else if (commit.message.toLowerCase().includes("database")) {
          type = "Database";
        } else if (commit.message.toLowerCase().includes("documentation")) {
          type = "Documentation";
        } else if (commit.message.toLowerCase().includes("api")) {
          type = "API";
        }

        return [
          commit.message,
          type,
          `Commit by ${commit.author.name}`,
          new Date(commit.timestamp).toISOString().split("T")[0],
        ];
      });

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Nikhil!A49:D", // Changed to Nikhil tab starting at A49
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        resource: {
          values: rows,
        },
      });

      res.status(200).send("Commits sent to Google Sheets");
    } else {
      // Other event types that we're not handling
      return res.status(200).send("Event received but not processed");
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
    return res.status(500).send("Internal Server Error");
  }
});

const port = process.env.PORT || 3005;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
