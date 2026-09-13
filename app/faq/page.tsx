import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "FAQ | FOAM",
  description:
    "Answers to common questions about FOAM laundry and dry cleaning — pickup, delivery, care preferences, and payments.",
};

type FaqItem = {
  question: string;
  answer: string[];
};

const FAQ_CATEGORIES: { category: string; items: FaqItem[] }[] = [
  {
    category: "Laundry & Dry Cleaning",
    items: [
      {
        question: "What is the minimum order price for Laundry & Dry Cleaning orders?",
        answer: [
          "Laundry ONLY — $50 minimum order.",
          "Dry Clean ONLY — $50 minimum order.",
          "Laundry & Dry Clean — $50 minimum for laundry and $25 minimum on dry-cleaned items.",
        ],
      },
      {
        question: "Are lights and darks separated?",
        answer: [
          "Lights and colors are only separated if you specify that in your order details when placing your order.",
        ],
      },
      {
        question: "What laundry detergents do we offer?",
        answer: [
          "We offer several detergent, softener, and dryer-sheet options. Choose your preference when you book:",
          "1. Standard Scented",
          "2. Hypoallergenic",
          "3. Organic",
          "4. Provide your own",
        ],
      },
      {
        question: "What temperature are the clothes washed in?",
        answer: [
          "Cold — all loads are washed cold unless you request otherwise.",
        ],
      },
      {
        question: "Who is doing my laundry?",
        answer: [
          "Your laundry is handled by trained laundry professionals at our secure, professional facility. We do not outsource to individuals working out of private residences — so your items are cleaned in a controlled, hygienic environment with consistent quality and care.",
        ],
      },
      {
        question: "Do clothes get mixed with other orders?",
        answer: [
          "No. Clothes are never mixed with other orders. Every order is tagged and kept separate.",
        ],
      },
      {
        question: "Can I choose what water temperature I want for washing?",
        answer: [
          "Yes. You can select cold, warm, or hot when you set your preferences. You can update these anytime when you place or manage an order.",
        ],
      },
      {
        question: "Can I choose my dryer temperature?",
        answer: [
          "Yes. You can select low, medium, or high when you set your preferences. You can update these anytime when you place or manage an order.",
        ],
      },
      {
        question: "Is there a limit to how much I can send in to be washed?",
        answer: [
          "No — you can send all your laundry at once. Orders over 75 pounds may take an additional day to process.",
        ],
      },
    ],
  },
  {
    category: "Pickup & Delivery",
    items: [
      {
        question: "What time is pickup and delivery?",
        answer: [
          "Pickup and delivery typically occur between 7:00 am and 7:00 pm, unless you arrange a specific timed window for an additional fee.",
        ],
      },
      {
        question: "Where is laundry left for pickup / drop-off?",
        answer: [
          "We recommend a spot protected from the weather when possible. Most customers have us leave laundry on a front or back porch, in a garage, or with a building manager.",
          "Include clear pickup and drop-off instructions when you book so your driver knows exactly where to go.",
          "We also watch the weather. If heavy rain or extreme conditions are coming, we'll contact you and make alternate plans.",
        ],
      },
      {
        question: "Do I need to be home for delivery or pickup?",
        answer: [
          "No — that's the point. Leave your bag outside on pickup day after you've booked, and go on with your day.",
        ],
      },
      {
        question:
          "I forgot to leave my laundry out on my scheduled pickup day. What should I do?",
        answer: [
          "We send reminders to help you remember pickup day. If laundry isn't left out, a missed pickup fee may apply to cover the driver trip.",
          "To avoid missed pickup fees: cancel or move the pickup by 4:00 am ET on the day of your scheduled pickup. Cancellations after 4:00 am ET may be subject to a missed pickup fee.",
        ],
      },
      {
        question: "What happens if you lose or damage some garments?",
        answer: [
          "We take care of your laundry carefully. If something is lost or damaged, notify us within 24 hours of delivery.",
          "We cannot be responsible for laundry damaged by weather after it has been dropped off at your home.",
        ],
      },
      {
        question: "Where is my driver?",
        answer: [
          "Drivers start as early as 7:00 am and continue through the evening. When your route begins, you'll get a notification with estimated arrival times based on your preferences.",
          "Some drivers may also reach out by phone when they arrive.",
        ],
      },
      {
        question:
          "It's raining and I'm afraid my clean laundry will get wet. What should I do?",
        answer: [
          "In bad weather we double-bag your laundry to protect it. We always do our best — but we cannot be responsible for weather damage after drop-off at your home.",
        ],
      },
    ],
  },
  {
    category: "Specialties",
    items: [
      {
        question: "Can I request a hypoallergenic detergent?",
        answer: [
          "Yes. FOAM offers hypoallergenic, organic, and unscented options — choose what you need when you book.",
        ],
      },
      {
        question: "What steps do you take to accommodate customers with allergies?",
        answer: [
          "If you are highly sensitive to scents from laundry products, we may not be able to guarantee a completely scent-free return. We'll follow your preferences as closely as possible. Contact us before scheduling if you have questions.",
        ],
      },
      {
        question: "Do you treat stains?",
        answer: [
          'Yes. Place stained items in a "Special Attention" bag and note it in your order details — we\'ll do our best. Pretreating the stain yourself improves the odds. We can\'t guarantee every stain will come out.',
        ],
      },
      {
        question: "Do you wash larger items?",
        answer: [
          "Yes. Machine-washable large items like dog beds, large comforters, and large blankets can be included for an additional $10 fee per item.",
        ],
      },
      {
        question: "Do you launder coats?",
        answer: [
          "Yes — any machine-washable coat can go with your regular laundry. Coats that need dry cleaning should be sent as dry cleaning (see our Dry Cleaning page).",
        ],
      },
      {
        question: "Can I send in my shoes to be washed?",
        answer: ["Any machine-washable shoes may be sent in."],
      },
      {
        question: "Can I send my undergarments in to be washed?",
        answer: ["Yes — anything that is machine washable is welcome."],
      },
      {
        question: "Does FOAM wash, dry, and fold bedding?",
        answer: [
          "Yes. Bedding is washed, dried, and returned neatly folded.",
        ],
      },
      {
        question: "Do you launder items that are soiled?",
        answer: [
          "FOAM reserves the right to refuse items soiled with bodily fluids, chemicals, or garbage. If we can't launder them, they'll be returned unwashed.",
          "If we can launder them, a sanitation fee may apply.",
        ],
      },
      {
        question:
          "We have a business that offers towels to guests — can we send just towels?",
        answer: [
          "Yes. We launder towels for both residential and commercial pickups.",
        ],
      },
    ],
  },
  {
    category: "Payments",
    items: [
      {
        question: "How do I pay?",
        answer: [
          "Before your first pickup, we'll send a secure link to save a card on file with Stripe. We never collect card details over WhatsApp or text. Your card is charged after your laundry is weighed and processed.",
        ],
      },
      {
        question: "What happens if my card can't be charged on the day of delivery?",
        answer: [
          "Once we reach out, update your card or add funds and reply so we can charge the order.",
          "If that isn't resolved in time (3+ hours before scheduled delivery), a $10 late charging fee may be added to your order.",
        ],
      },
      {
        question:
          "I forgot to cancel or move my scheduled pickup in time — what happens?",
        answer: [
          "A $17 missed pickup fee may be charged to cover driver costs.",
        ],
      },
      {
        question: "Is my identity and payment information protected?",
        answer: [
          "Yes. Identity and payment information are processed securely through Stripe.",
        ],
      },
      {
        question: "Can I cancel my repeat pickups at any time?",
        answer: [
          "When you sign up as a repeat customer, you're agreeing to complete at least 5 pickups within a 12-month period. That keeps discounted pricing fair and sustainable.",
          "If fewer than 5 repeat orders are completed within the year, a $17 early cancellation fee may apply to cover discounts already given.",
          "Circumstances change — reach out if you have questions; some exceptions may apply.",
        ],
      },
      {
        question: "What happens if my credit card is declined?",
        answer: [
          "When we pick up, we weigh and pre-authorize your card. If the charge isn't accepted, we may hold processing until it's cleared. You'll get notifications based on your preferences.",
          "If items are already laundered, we may hold them until the invoice is paid. Once paid, we'll drop off on our next pass in your area — usually within 3 business days.",
        ],
      },
      {
        question: "What is a credit or debit card pre-authorization?",
        answer: [
          "A pre-authorization is a temporary hold on your card (typically five days or less, set by your bank) to confirm the card works — available funds, address match, and that the card is active.",
          "We initiate it once your laundry is weighed. When your laundry is returned, we charge the final amount and the hold is released. You'll get an invoice for tracking.",
        ],
      },
      {
        question: "Why does FOAM pre-authorize my order?",
        answer: [
          "Before we start washing, we place a hold for the estimated order total based on weight. It may show as a pending charge on your statement.",
          "When everything is ready to return, we bill the final total and release the pending hold. Unless your order includes per-item large pieces (comforters, pillows, etc.), the final invoice is usually within about $10 of the pre-authorized amount.",
        ],
      },
      {
        question: "What is FOAM's non-payment & order status policy?",
        answer: [
          "All orders must be paid in full.",
          "If an order has already been washed and folded: it will not be released or returned until full payment is received.",
          "If an order has not yet been washed or processed: you may request return of your items by paying an Unprocessed Order Return Fee of $22 (handling, logistics, and admin). No processing occurs once a return is requested.",
          "Unpaid orders are stored securely for up to 14 days from the original service date. If payment or resolution isn't completed in that time, the order may be considered abandoned under company policy. FOAM is not responsible for items left beyond that storage period.",
        ],
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <main className="overflow-hidden bg-background text-foreground selection:bg-accent">
      <SiteHeader />

      <section className="dc-hero" aria-label="FAQ">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/foam-faq-hero.png"
          alt="FOAM FAQ — Questions, answered. Common questions about laundry, dry cleaning, pickup, and payment."
          width={1800}
          height={900}
          className="dc-hero-image"
        />
      </section>

      <section className="section-pad">
        <div className="site-shell max-w-3xl">
          <div className="faq-groups">
            {FAQ_CATEGORIES.map((group) => (
              <div key={group.category} className="faq-group">
                <p className="faq-category-label">{group.category}</p>
                <div className="faq-list">
                  {group.items.map((item) => (
                    <details key={item.question} className="faq-item">
                      <summary className="faq-item-trigger">
                        {item.question}
                      </summary>
                      <div className="faq-item-body">
                        {item.answer.map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
