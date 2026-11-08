import type { Request, Response } from "express";
import createError from "http-errors";
import prisma from "../../prisma/client.ts";
import { PER_PAGE } from "../config.ts";
import type {
  CreateAnnouncementInput,
  IdParam,
  ListQuery,
  UpdateAnnouncementInput,
} from "../validators/announcements.validator.ts";

// Response shape from the spec: no userId, author is nested under "user".
const select = {
  id: true,
  title: true,
  description: true,
  price: true,
  category: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, username: true, email: true, name: true } },
} as const;

export async function list(_req: Request, res: Response) {
  const { search, sort, page } = res.locals.query as ListQuery;

  const where = search
    ? { title: { contains: search, mode: "insensitive" as const } }
    : {};

  const [total, data] = await Promise.all([
    prisma.announcement.count({ where }),
    prisma.announcement.findMany({
      where,
      select,
      orderBy: { createdAt: sort === "oldest" ? "asc" : "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
  ]);

  res.json({
    data,
    pagination: {
      total,
      page,
      totalPages: Math.ceil(total / PER_PAGE),
      perPage: PER_PAGE,
    },
  });
}

export async function getOne(_req: Request, res: Response) {
  const { id } = res.locals.params as IdParam;

  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select,
  });
  if (!announcement) {
    throw createError(404, "Announcement not found");
  }
  res.json(announcement);
}

export async function create(req: Request, res: Response) {
  const data = req.body as CreateAnnouncementInput;

  const announcement = await prisma.announcement.create({
    // The author always comes from the token, never from the request body.
    data: { ...data, userId: Number(req.user!.sub) },
    select,
  });
  res.status(201).json(announcement);
}

async function findOwned(id: number, sub: string) {
  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) {
    throw createError(404, "Announcement not found");
  }
  if (announcement.userId !== Number(sub)) {
    throw createError(403, "Access denied");
  }
  return announcement;
}

export async function update(req: Request, res: Response) {
  const { id } = res.locals.params as IdParam;
  await findOwned(id, req.user!.sub);

  const announcement = await prisma.announcement.update({
    where: { id },
    data: req.body as UpdateAnnouncementInput,
    select,
  });
  res.json(announcement);
}

export async function remove(req: Request, res: Response) {
  const { id } = res.locals.params as IdParam;
  await findOwned(id, req.user!.sub);

  await prisma.announcement.delete({ where: { id } });
  res.status(204).end();
}
