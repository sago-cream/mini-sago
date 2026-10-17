import type { ChatbotMessage } from "./worker-contract";

type MessageContext = {
  requestMessage?: ChatbotMessage;
  messages: ChatbotMessage[];
};

/** Keep the current message and its reply target ahead of nearby history. */
export function messageContextEntries(job: MessageContext) {
  const roots = [
    ...(job.requestMessage ? [job.requestMessage] : []),
    ...job.messages,
  ];
  return roots.flatMap((root, order) =>
    [root, ...(root.referencedMessage ? [root.referencedMessage] : [])].map(
      (message) => ({
        message,
        direct: root === job.requestMessage,
        order,
      }),
    ),
  );
}

export function hasContextAttachments(job: MessageContext) {
  return messageContextEntries(job).some(
    ({ message }) => message.attachments.length > 0,
  );
}
