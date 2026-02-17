import type { MatchPreview, ProfileCard } from "../types";

export const swipeDeckSeed: ProfileCard[] = [
  {
    id: "u2",
    name: "Sam",
    age: 26,
    bio: "Bookstores, city walks, and tacos after midnight.",
    photos: ["https://picsum.photos/600/900?10", "https://picsum.photos/600/900?11"],
    hobbies: ["Bookshops", "Live Music", "Late-night Eats"],
    questionAnswers: [
      {
        question: "Ideal first date?",
        answer: "Coffee, a walk, then tacos."
      },
      {
        question: "A simple joy?",
        answer: "Finding a quiet corner in a bookstore."
      }
    ]
  },
  {
    id: "u3",
    name: "Taylor",
    age: 30,
    bio: "Gallery dates and coffee shop mornings.",
    photos: ["https://picsum.photos/600/900?12", "https://picsum.photos/600/900?13"],
    hobbies: ["Art Galleries", "Running", "Photography"],
    questionAnswers: [
      {
        question: "Weekend plan?",
        answer: "Morning run, then an art exhibit."
      },
      {
        question: "Conversation topic I love?",
        answer: "Travel stories and design."
      }
    ]
  }
];

export const matchSeed: MatchPreview[] = [
  {
    id: "m1",
    otherUserId: "u2",
    name: "Sam",
    avatarUrl: "https://picsum.photos/200/200?41",
    messagesUsedByMe: 2,
    messagesUsedByThem: 2,
    meetDecisionByMe: null,
    meetDecisionByThem: null,
    chat: [
      {
        id: "c1",
        sender: "them",
        body: "Hey, how's your week going?",
        createdAt: new Date().toISOString()
      },
      {
        id: "c2",
        sender: "me",
        body: "Pretty good, just wrapped work.",
        createdAt: new Date().toISOString()
      },
      {
        id: "c3",
        sender: "them",
        body: "Nice, want to swap favorite coffee spots?",
        createdAt: new Date().toISOString()
      },
      {
        id: "c4",
        sender: "me",
        body: "Absolutely, I have a few good ones.",
        createdAt: new Date().toISOString()
      }
    ]
  },
  {
    id: "m2",
    otherUserId: "u3",
    name: "Taylor",
    avatarUrl: "https://picsum.photos/200/200?42",
    messagesUsedByMe: 30,
    messagesUsedByThem: 30,
    meetDecisionByMe: null,
    meetDecisionByThem: null,
    chat: [
      {
        id: "c5",
        sender: "them",
        body: "Great chatting with you.",
        createdAt: new Date().toISOString()
      },
      {
        id: "c6",
        sender: "me",
        body: "Same here. Want to decide if we should meet in person?",
        createdAt: new Date().toISOString()
      }
    ]
  }
];
