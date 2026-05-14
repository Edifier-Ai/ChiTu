import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const token = process.env.STITCH_ACCESS_TOKEN;
const projectId = process.env.STITCH_PROJECT_ID;

console.log("=== Stitch Connection Test ===\n");

if (!token) {
  console.error("ERROR: STITCH_ACCESS_TOKEN not set");
  process.exit(1);
}
if (!projectId) {
  console.error("ERROR: STITCH_PROJECT_ID not set");
  process.exit(1);
}

console.log("Project ID:", projectId);
console.log("Access Token:", token.slice(0, 20) + "...\n");

try {
  const { stdout } = await execAsync(
    `curl -s -X GET "https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}" -H "Authorization: Bearer ${token}"`
  );
  const project = JSON.parse(stdout);

  if (project.error) {
    console.error("API Error:", JSON.stringify(project.error, null, 2));
    process.exit(1);
  }

  console.log("Project Info:");
  console.log("  Name:", project.name);
  console.log("  State:", project.lifecycleState);
  console.log("\nConnection successful!");
} catch (err) {
  console.error("Request failed:", err.message);
  process.exit(1);
}
