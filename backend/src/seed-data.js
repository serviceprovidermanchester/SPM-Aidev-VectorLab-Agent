"use strict";
// Seed data for VectorLab. The showcase workspace is the Manchester
// Business Help Centre, a fictional content team in the Northern Quarter,
// Manchester, whose help-article collections are seeded local data: three
// collections of short articles with topic labels, written for this product
// so every vector, ranking and cluster can be inspected and recomputed.
// The second collection (the Topic Check Set) is deliberately tiny — nine
// three-word documents across three topics with disjoint vocabularies — so
// its TF-IDF scores, hashed buckets and k-means result can all be verified
// by hand; the labelled expected-output cases in the test suite are built
// on exactly this fixture shape.
const PRODUCT = {
  name: "VectorLab", tagline: "See what similarity really means",
  serviceId: "spm-aidev-vectorlab-api",
  ownerName: "Maya Patel", ownerEmail: "owner@manchesterbusinesshelp.co.uk", ownerPassword: "Owner2026!",
  staffName: "Jack Turner", staffEmail: "team@manchesterbusinesshelp.co.uk", staffPassword: "Team2026!",
};
const WORKSPACE = {
  name: "Manchester Business Help Centre", slug: "manchester-business-help-centre",
  team: "Content & Search Team", location: "Northern Quarter, Manchester",
};
// Main collection: 16 help articles, 4 topics, stored interleaved so the
// first four documents already span all four topics.
const MAIN_DOCS = [
  { title: "Booking a dental check-up in Didsbury", topic: "Dental & clinics",
    body: "Book a dental check-up with our dentist team in Didsbury. Your appointment includes an examination, digital x-rays where needed, a hygiene polish and a written treatment plan with clear prices before any treatment begins." },
  { title: "Ordering Sunday lunch for a group", topic: "Food & hospitality",
    body: "Reserve a table for Sunday lunch and order from our seasonal menu. Our kitchen serves roast dishes, vegetarian options and desserts, with allergen information for every dish and group bookings for up to twenty guests." },
  { title: "Starting a strength programme at the gym", topic: "Fitness & wellness",
    body: "Start a strength programme with a coach-led induction at the gym. Your plan builds workout sessions around squats, presses and rows, tracks your training progress weekly and adjusts weights as your fitness improves." },
  { title: "Booking a property viewing in Chorlton", topic: "Property & lettings",
    body: "Book a viewing for homes to rent or buy in Chorlton. Our property team confirms your appointment by email, shares the property details in advance and answers questions about rent, deposit and tenancy terms." },
  { title: "Dental implants: what the treatment involves", topic: "Dental & clinics",
    body: "Dental implants replace missing teeth with a titanium post and a natural-looking crown. Treatment starts with a scan and consultation, and most patients return to work the day after the implant is placed by the dentist." },
  { title: "Allergen information for our menu", topic: "Food & hospitality",
    body: "Every dish on our menu lists its allergen information clearly. Tell our team about any allergy before ordering and the kitchen will prepare your food separately, with ingredients checked and labelled for your table." },
  { title: "Cardio classes and heart-rate training", topic: "Fitness & wellness",
    body: "Our cardio classes mix cycling, rowing and intervals to build stamina and burn energy. Heart-rate zones guide each workout so members train at the right intensity, with coaches adjusting the session for every fitness level." },
  { title: "Understanding rent, deposits and tenancy agreements", topic: "Property & lettings",
    body: "Before you rent a property, check the monthly rent, the deposit protection scheme and the tenancy agreement length. Our lettings team explains every charge in writing so tenants know the full cost before signing." },
  { title: "Teeth whitening options and aftercare", topic: "Dental & clinics",
    body: "Professional teeth whitening lifts stains from coffee, tea and red wine. The dentist checks your enamel first, applies the whitening gel safely and explains aftercare so your smile stays bright for longer." },
  { title: "How our kitchen handles group bookings", topic: "Food & hospitality",
    body: "Group bookings of eight or more can pre-order from a set menu so the kitchen serves every course together. Share dietary needs in advance and our team will confirm dishes, timings and the final bill split." },
  { title: "Muscle building: protein, rest and progressive training", topic: "Fitness & wellness",
    body: "Building muscle needs progressive training, enough protein and proper rest between gym sessions. Our coaches design workout plans that add small weight increases weekly and track strength gains across each training block." },
  { title: "Selling your home: valuation and viewings", topic: "Property & lettings",
    body: "Selling your home starts with an accurate valuation based on recent local sales. Our property team photographs each room, writes the listing details and arranges viewings that suit buyers and sellers alike." },
  { title: "Children's dentistry: first visits made easy", topic: "Dental & clinics",
    body: "Children's first dental visits should feel relaxed and friendly. Our dentist team uses short check-up appointments, fluoride protection and simple brushing guidance so young patients build healthy teeth habits early." },
  { title: "Seasonal desserts and our baking kitchen", topic: "Food & hospitality",
    body: "Our baking kitchen prepares seasonal desserts daily, from flour-and-butter pastry to baked fruit crumbles. The dessert menu changes with the market, and every recipe lists sugar content and allergen notes for guests." },
  { title: "Recovery: stretching, sleep and rest days", topic: "Fitness & wellness",
    body: "Recovery days help muscles repair after hard training. Gentle stretching, good sleep and lighter gym sessions keep workout progress steady and reduce injury risk for members following a weekly fitness programme." },
  { title: "Property management for landlords", topic: "Property & lettings",
    body: "Our property management service handles rent collection, inspections and repairs for landlords. Tenants report issues through one contact, and our team arranges trusted tradespeople while keeping landlords updated on every property." },
];
// The hand-verifiable fixture: nine three-word documents, three topics with
// disjoint vocabularies, stored interleaved (dental, recipes, fitness) so
// the first-k centroid seeding starts from one document per topic.
const FIXTURE_DOCS = [
  { title: "Dental visit basics", topic: "dental", body: "dentist tooth implant" },
  { title: "Baking basics", topic: "recipes", body: "recipe bake flour" },
  { title: "Gym basics", topic: "fitness", body: "gym workout muscle" },
  { title: "Dental filling notes", topic: "dental", body: "dentist tooth filling" },
  { title: "Baking with sugar", topic: "recipes", body: "recipe bake sugar" },
  { title: "Cardio notes", topic: "fitness", body: "gym workout cardio" },
  { title: "Implant and crown notes", topic: "dental", body: "dentist implant crown" },
  { title: "Flour and cake notes", topic: "recipes", body: "recipe flour cake" },
  { title: "Muscle training notes", topic: "fitness", body: "gym muscle training" },
];
const SUPPORT_DOCS = [
  { title: "Resetting your account password", topic: "accounts",
    body: "Reset your account password from the sign-in page. We email a secure link that expires in one hour, and your account stays locked until the new password is set and confirmed." },
  { title: "Tracking a delivery", topic: "deliveries",
    body: "Track your delivery with the reference in your confirmation email. The courier updates the parcel status at each depot, and delivery slots can be changed until the evening before arrival." },
  { title: "Paying an invoice by card", topic: "payments",
    body: "Pay an invoice online by card in a few minutes. The payment page shows the invoice total, accepts major cards and emails a receipt once the payment clears your bank." },
  { title: "Changing a booking time", topic: "bookings",
    body: "Change your booking time from your account page up to a day before the appointment. The new time is confirmed by email and the original booking slot is released straight away." },
  { title: "Updating your contact details", topic: "accounts",
    body: "Update your contact details so confirmations reach the right inbox. Email address changes need one confirmation click, while phone number changes are verified with a short code by text." },
  { title: "Refunds for cancelled orders", topic: "payments",
    body: "Refunds for cancelled orders return to the original payment card within five working days. You receive an email when the refund is issued, showing the order reference and refunded amount." },
];
const COLLECTIONS = [
  { name: "Business Help Articles", description: "Sixteen help articles across dental, food, fitness and property topics, written by the showcase content team.", docs: MAIN_DOCS },
  { name: "Topic Check Set", description: "Nine three-word documents in three topics with disjoint vocabularies — the hand-verifiable fixture set for scores, buckets and clusters.", docs: FIXTURE_DOCS },
  { name: "Support Answer Drafts", description: "Six short support answers covering accounts, deliveries, payments and bookings.", docs: SUPPORT_DOCS },
];
module.exports = { PRODUCT, WORKSPACE, COLLECTIONS, MAIN_DOCS, FIXTURE_DOCS, SUPPORT_DOCS };
