import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { teams, teamMembers, users } from "@/db/schema";

export interface TeamRow {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMemberRow {
  userId: string;
  teamId: string;
  role: string;
  displayName: string;
  email: string;
  joinedAt: Date;
}

export async function createTeam(
  name: string,
  description: string,
  creatorID: string,
): Promise<TeamRow> {
  if (!name) throw new Error("team name is required");

  const result = await db.transaction(async (tx) => {
    const [team] = await tx
      .insert(teams)
      .values({ name, description })
      .returning();

    await tx.insert(teamMembers).values({
      teamId: team.id,
      userId: creatorID,
      role: "admin",
    });

    return team;
  });

  return mapTeam(result);
}

export async function getTeam(teamID: string): Promise<TeamRow> {
  const [row] = await db.select().from(teams).where(eq(teams.id, teamID)).limit(1);
  if (!row) throw new Error("team not found");
  return mapTeam(row);
}

export async function listTeams(userID: string): Promise<TeamRow[]> {
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      description: teams.description,
      createdAt: teams.createdAt,
      updatedAt: teams.updatedAt,
    })
    .from(teams)
    .innerJoin(teamMembers, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, userID))
    .orderBy(sql`${teams.updatedAt} DESC`);
  return rows.map(mapTeam);
}

export async function updateTeam(
  teamID: string,
  name?: string,
  description?: string,
): Promise<TeamRow> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;

  const [row] = await db.update(teams).set(updates).where(eq(teams.id, teamID)).returning();
  if (!row) throw new Error("team not found");
  return mapTeam(row);
}

export async function deleteTeam(teamID: string): Promise<void> {
  const result = await db.delete(teams).where(eq(teams.id, teamID)).returning();
  if (!result.length) throw new Error("team not found");
}

export async function addMember(
  teamID: string,
  userID: string,
  role: string,
): Promise<TeamMemberRow> {
  if (!role) role = "contributor";
  const typedRole = role as "admin" | "contributor" | "viewer";

  const [member] = await db
    .insert(teamMembers)
    .values({ teamId: teamID, userId: userID, role: typedRole })
    .returning();

  const [user] = await db.select().from(users).where(eq(users.id, userID)).limit(1);

  return {
    userId: member.userId,
    teamId: member.teamId,
    role: member.role,
    displayName: user?.displayName || "",
    email: user?.email || "",
    joinedAt: member.joinedAt,
  };
}

export async function removeMember(teamID: string, userID: string): Promise<void> {
  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamID), eq(teamMembers.userId, userID)));
}

export async function updateMemberRole(
  teamID: string,
  userID: string,
  role: string,
): Promise<TeamMemberRow> {
  const [member] = await db
    .update(teamMembers)
    .set({ role: role as "admin" | "contributor" | "viewer" })
    .where(and(eq(teamMembers.teamId, teamID), eq(teamMembers.userId, userID)))
    .returning();

  if (!member) throw new Error("member not found");

  const [user] = await db.select().from(users).where(eq(users.id, userID)).limit(1);

  return {
    userId: member.userId,
    teamId: member.teamId,
    role: member.role,
    displayName: user?.displayName || "",
    email: user?.email || "",
    joinedAt: member.joinedAt,
  };
}

export async function listMembers(teamID: string): Promise<TeamMemberRow[]> {
  const rows = await db
    .select({
      userId: teamMembers.userId,
      teamId: teamMembers.teamId,
      role: teamMembers.role,
      joinedAt: teamMembers.joinedAt,
      displayName: users.displayName,
      email: users.email,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamID));

  return rows;
}

function mapTeam(row: { id: string; name: string; description: string; createdAt: Date; updatedAt: Date }): TeamRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
