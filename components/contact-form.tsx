"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { submitContactMessage } from "@/lib/contact-messages";
import { CONTACT_EMAIL } from "@/lib/site-config";

export function ContactForm() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");

    const data = new FormData(event.currentTarget);

    try {
      await submitContactMessage({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        phone: String(data.get("phone") ?? ""),
        topic: String(data.get("topic") ?? "General question"),
        message: String(data.get("message") ?? ""),
      });
      setSent(true);
      event.currentTarget.reset();
    } catch {
      setError(
        `Could not send your message. Try again, or email ${CONTACT_EMAIL}.`
      );
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="contact-success" role="status">
        <div className="contact-success-icon" aria-hidden="true">
          <Check />
        </div>
        <h2 className="contact-success-title">Message sent</h2>
        <p>Thanks — we got your note and will get back to you soon.</p>
        <Button
          type="button"
          variant="outline"
          className="mt-6"
          onClick={() => setSent(false)}
        >
          Send another
        </Button>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <div className="contact-field">
        <label htmlFor="contact-name">Name</label>
        <input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={120}
        />
      </div>

      <div className="contact-field">
        <label htmlFor="contact-email">Email</label>
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={200}
        />
      </div>

      <div className="contact-field">
        <label htmlFor="contact-phone">
          Phone <span>(optional)</span>
        </label>
        <input
          id="contact-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={40}
        />
      </div>

      <div className="contact-field">
        <label htmlFor="contact-topic">Topic</label>
        <select id="contact-topic" name="topic" defaultValue="General question">
          <option>General question</option>
          <option>Cancel my order</option>
          <option>Refund request</option>
          <option>Billing / price question</option>
          <option>Scheduling help</option>
          <option>Change pickup or address</option>
          <option>Complaint / quality issue</option>
          <option>Dry cleaning</option>
          <option>Account or billing</option>
          <option>Something else</option>
        </select>
      </div>

      <div className="contact-field contact-field-full">
        <label htmlFor="contact-message">Message</label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          required
          maxLength={4000}
        />
      </div>

      {error ? (
        <p className="contact-form-error contact-field-full" role="alert">
          {error}
        </p>
      ) : null}

      <div className="contact-actions">
        <Button type="submit" size="lg" disabled={sending}>
          {sending ? "Sending..." : "Send message"}
          {!sending ? <ArrowRight /> : null}
        </Button>
      </div>
    </form>
  );
}
