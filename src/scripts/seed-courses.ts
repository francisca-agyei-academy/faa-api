/**
 * Loads the website's starting course catalog into the database.
 * Safe to re-run: a course whose slug already exists is skipped, so edits made in the
 * admin panel are never overwritten.
 *
 *   pnpm seed:courses
 */
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";

interface SeedModule {
  title: string;
  description?: string;
  topics: string[];
}

interface SeedCourse {
  slug: string;
  title: string;
  description: string;
  track: string;
  imageKey: string;
  audience?: string;
  outcomeFrom?: string;
  outcomeTo?: string;
  topics?: string[];
  modules?: SeedModule[];
  isFeatured?: boolean;
  includesToolkit?: boolean;
  includesSignatureBonus?: boolean;
}

const catalog: SeedCourse[] = [
  {
    slug: "bachelors-to-funded-masters-and-phd",
    track: "Scholarships for Masters & PhDs",
    title: "From Bachelor's to Fully Funded Master's and PhD",
    description:
      "A step-by-step path from your first search to a strategic, fully funded postgraduate application abroad.",
    imageKey: "graduate",
    audience:
      "African final-year students, recent graduates and early-career applicants who want a funded postgraduate degree abroad but do not know how to navigate the process.",
    outcomeFrom: "I want to do a PhD abroad, but I have no idea where to start.",
    outcomeTo:
      "I understand the process, know where to search, can identify supervisors, prepare my documents and submit a strategic application.",
    isFeatured: true,
    includesToolkit: true,
    includesSignatureBonus: true,
    modules: [
      { title: "Is a PhD Abroad Right for You?", topics: ["PhD vs Master's", "Funding models", "Direct-entry PhDs", "Indirect-entry PhDs", "Eligibility and expectations"] },
      { title: "Finding Fully Funded Opportunities", topics: ["Where to search", "Universities and funding databases", "Supervisor-led opportunities", "Funding tracker", "Evaluating opportunities"] },
      { title: "Finding the Right Supervisor", topics: ["Research fit", "Supervisor search", "Shortlisting", "Planning worksheet", "Red flags and fit checklist"] },
      { title: "Approaching Supervisors", topics: ["Email structure", "Personalisation", "Research-fit message", "Follow-up strategy", "Common mistakes", "Tracking emails"] },
      { title: "Building Your Academic Profile", topics: ["Academic CV", "Research experience", "Publications", "Conferences", "Online academic profiles"] },
      { title: "Creating the Application", topics: ["SOP / personal statement", "Research proposal", "References and recommendations", "Document checklist", "Application strategy"] },
      { title: "Interviews, Offers & Funding", topics: ["Interview preparation", "Common questions", "Understanding offers", "Funding packages", "Decision-making"] },
      { title: "From Acceptance to Moving Abroad", topics: ["Visa preparation", "Finances", "Accommodation", "Arrival planning", "Academic adjustment"] },
    ],
  },
  {
    slug: "life-after-your-offer-letter",
    track: "Studying Abroad & Postgraduate Success",
    title: "Life After Your Offer Letter",
    description:
      "Everything after the offer letter: settling in abroad, working with your supervisor, academic writing, publishing, AI for research and building an international career.",
    imageKey: "laptop-campus",
    modules: [
      {
        title: "Your First 30 Days Abroad",
        description: "Practical orientation for international students, from the airport to your first weeks on campus.",
        topics: ["Arrival", "Accommodation", "Banking", "Tax file number (TFN)", "Healthcare", "Transport", "Internet", "University setup and adjustment"],
      },
      {
        title: "Knowing Your Supervisor & Understanding Your Course",
        description: "Build a strong working relationship with your supervisor and take ownership of your degree.",
        topics: [
          "Know your supervisor",
          "Supervisor–student expectations, including the use of AI",
          "How to work with your supervisor",
          "Understanding your academic and research environment",
          "When things don't go as planned",
          "Taking ownership of your degree",
        ],
      },
      {
        title: "Building an International Academic Career",
        description: "Grow your network, profile and opportunities beyond your degree.",
        topics: ["Networking", "Seminars", "Conferences", "Fellowships", "Research collaborations", "Academic profiles and international career pathways"],
      },
      {
        title: "Academic Writing Made Simple",
        description: "Write clearly, think critically and reference correctly, with responsible use of AI.",
        topics: ["Academic writing", "Critical thinking", "Literature reviews", "Structure", "Referencing", "Plagiarism and responsible AI"],
      },
      {
        title: "From Research Project to Published Paper",
        description: "Take a research project through manuscript development, submission and peer review.",
        topics: ["Taking a research project through manuscript development", "Journal selection", "Submission", "Peer review and publication"],
      },
      {
        title: "AI for Academic Research",
        description: "Use AI responsibly to understand literature, support your writing and speed up research workflows.",
        topics: [
          "Responsible AI use for brainstorming",
          "Literature understanding",
          "Writing support",
          "Research workflows",
          "Coding and data assistance, and presentations",
        ],
      },
    ],
  },
];

async function main() {
  let created = 0;
  for (const [index, seed] of catalog.entries()) {
    const existing = await db.orm.public.Course.where({ slug: seed.slug }).select("id").first();
    if (existing) {
      logger.info({ slug: seed.slug }, "course exists, skipped");
      continue;
    }
    const { modules = [], ...fields } = seed;
    const course = await db.orm.public.Course.create({
      ...fields,
      audience: fields.audience ?? null,
      outcomeFrom: fields.outcomeFrom ?? null,
      outcomeTo: fields.outcomeTo ?? null,
      topics: fields.topics ?? [],
      isPublished: true,
      sortOrder: index,
    });
    for (const [position, mod] of modules.entries()) {
      await db.orm.public.Module.create({
        courseId: course.id,
        title: mod.title,
        description: mod.description ?? null,
        topics: mod.topics,
        order: position + 1,
        price: null,
        accessDays: null,
        isPublished: true,
      });
    }
    created++;
    logger.info({ slug: seed.slug, modules: modules.length }, "course created");
  }
  logger.info({ created, skipped: catalog.length - created }, "seed complete");
}

try {
  await main();
} finally {
  await db.close();
}
