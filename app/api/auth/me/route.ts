import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { user } = session;

    // Fetch client info if user has a client
    let clientInfo = null;
    if (user.clientId) {
      clientInfo = await prisma.client.findUnique({
        where: { id: user.clientId },
        select: {
          id: true,
          cugId: true,
          cugCode: true,
          cugName: true,
          enabledPages: true,
          hasCustomDashboards: true,
        },
      });
    }

    // For KAM users, also fetch assigned clients
    let assignedClients: { id: string; cugName: string; cugCode: string | null }[] = [];
    if (user.role === "KAM") {
      const assignments = await prisma.userClientAssignment.findMany({
        where: { userId: user.id },
        include: {
          client: {
            select: { id: true, cugName: true, cugCode: true },
          },
        },
      });
      assignedClients = assignments.map((a) => a.client);
    }

    // For SUPER_ADMIN / INTERNAL_OPS, fetch all clients
    if (user.role === "SUPER_ADMIN" || user.role === "INTERNAL_OPS") {
      assignedClients = await prisma.client.findMany({
        select: { id: true, cugName: true, cugCode: true },
        orderBy: { cugName: "asc" },
      });
    }

    // For CLIENT_ADMIN / CLIENT_VIEWER, add their own client to the list
    if (["CLIENT_ADMIN", "CLIENT_VIEWER"].includes(user.role) && clientInfo) {
      assignedClients = [{
        id: clientInfo.id,
        cugName: clientInfo.cugName,
        cugCode: clientInfo.cugCode ?? null,
      }];
    }

    return NextResponse.json({
      user,
      client: clientInfo,
      assignedClients,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
