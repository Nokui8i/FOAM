"use client";

import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";

export function OptionSheet({
  title,
  options,
  value,
  images,
  onSelect,
  onClose,
}: {
  title: string;
  options: readonly string[];
  value: string;
  images?: Partial<Record<string, string>>;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="book-modal-root"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="book-modal-backdrop"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="book-modal">
        <div className="book-modal-head">
          <p className="book-modal-title">{title}</p>
          <button
            type="button"
            className="book-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="book-modal-list">
          {options.map((option) => {
            const active = value === option;
            const imageSrc = images?.[option];
            return (
              <button
                key={option}
                type="button"
                className={cn("book-modal-option", active && "is-active")}
                onClick={() => onSelect(option)}
              >
                <span className="book-modal-option-main">
                  {imageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageSrc}
                      alt=""
                      width={40}
                      height={56}
                      className="book-modal-option-img"
                    />
                  ) : (
                    <span
                      className="book-modal-option-img is-empty"
                      aria-hidden
                    />
                  )}
                  <span>{option}</span>
                </span>
                {active ? <Check size={16} strokeWidth={2.5} /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
