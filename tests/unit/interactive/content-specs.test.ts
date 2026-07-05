import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { attachmentCreateSpec } from "../../../src/commands/attachments.js";
import {
  commentCreateSpec,
  commentEditSpec,
  commentReplySpec,
} from "../../../src/commands/comments.js";
import {
  documentCreateSpec,
  documentUpdateSpec,
} from "../../../src/commands/documents.js";
import type { CommandContext } from "../../../src/common/context.js";
import {
  documentChoices,
  issueChoices,
} from "../../../src/common/interactive/choices.js";

function mockCtx(request: ReturnType<typeof vi.fn>): CommandContext {
  return { gql: { request } as unknown as GraphQLClient };
}

describe("commentCreateSpec / replySpec / editSpec", () => {
  it("requires body on every comment wizard", () => {
    for (const spec of [commentCreateSpec, commentReplySpec, commentEditSpec]) {
      const body = spec.fields.find((f) => f.name === "body");
      expect(body?.required).toBe(true);
      expect(body?.kind).toBe("multiline");
    }
  });
});

describe("documentCreateSpec", () => {
  it("requires title and uses entity selects for project/team", () => {
    const title = documentCreateSpec.fields.find((f) => f.name === "title");
    expect(title?.required).toBe(true);
    const project = documentCreateSpec.fields.find((f) => f.name === "project");
    const team = documentCreateSpec.fields.find((f) => f.name === "team");
    expect(project?.kind).toBe("select");
    expect(project?.choices).toBeDefined();
    expect(team?.kind).toBe("select");
    expect(team?.choices).toBeDefined();
  });

  it("offers an optional issue attachment via a searchable select", () => {
    const issue = documentCreateSpec.fields.find((f) => f.name === "issue");
    expect(issue?.kind).toBe("select");
    expect(issue?.required).not.toBe(true);
    expect(issue?.searchable).toBe(true);
    expect(issue?.choices).toBeDefined();
  });
});

describe("documentUpdateSpec", () => {
  it("has no required fields (a flag-supplied field is skipped, the rest prompted)", () => {
    expect(documentUpdateSpec.fields.every((f) => !f.required)).toBe(true);
    const title = documentUpdateSpec.fields.find((f) => f.name === "title");
    expect(title?.kind).toBe("text");
  });
});

describe("attachmentCreateSpec", () => {
  it("requires title and url", () => {
    const required = attachmentCreateSpec.fields
      .filter((f) => f.required)
      .map((f) => f.name);
    expect(required).toContain("title");
    expect(required).toContain("url");
  });

  it("covers the optional comment and icon-url flags", () => {
    const names = attachmentCreateSpec.fields.map((f) => f.name);
    expect(names).toContain("comment");
    expect(names).toContain("iconUrl");
    const comment = attachmentCreateSpec.fields.find(
      (f) => f.name === "comment",
    );
    expect(comment?.kind).toBe("multiline");
  });
});

describe("issueChoices (shared content-domain issue picker loader)", () => {
  it("maps issues to identifier-valued choices with state hints", async () => {
    const request = vi.fn().mockResolvedValue({
      issues: {
        nodes: [
          {
            identifier: "ENG-1",
            title: "Fix bug",
            state: { name: "Todo" },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const result = await issueChoices(mockCtx(request));

    expect(result).toEqual([
      { value: "ENG-1", label: "ENG-1 Fix bug", hint: "Todo" },
    ]);
  });
});

describe("documentChoices", () => {
  it("maps documents to UUID-valued choices", async () => {
    const request = vi.fn().mockResolvedValue({
      documents: {
        nodes: [{ id: "d1", title: "Spec", icon: null }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const result = await documentChoices(mockCtx(request));

    expect(result).toEqual([{ value: "d1", label: "Spec" }]);
  });
});
