import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from svgkit import Diagram, C, FAINT, MUTED

d = Diagram(1240, 640, "Wera for Chrome: architecture",
            "The side panel talks to your Wera server with its own token, and to the page only when you use it. It never submits.")

d.boundary(28, 108, 700, 460, "Your browser", C["blue"])
d.boundary(760, 108, 452, 460, "Your Wera server", C["green"])

d.card(52, 134, 300, 196, "browser", "Job site tab", ["Greenhouse, Lever, Ashby, Workday,", "any career page", "",
                                                       "content script, injected on demand:", "reads JobPosting data and text,", "finds, labels and fills fields"], C["slate"])
d.card(434, 134, 270, 196, "layers", "Side panel", ["React: Job, Apply, Letter, Resume", "token in chrome.storage.local",
                                                     "remembers each tab's job", "site access asked per site",
                                                     "highlights fields to check"], C["blue"])
d.card(434, 350, 270, 110, "clock", "Service worker", ["opens the panel from the toolbar", "and the page's right-click menu"], C["slate"])
d.card(52, 350, 300, 196, "shield", "Safety rails", ["never clicks Submit", "never ticks consent boxes", "never overwrites what you typed",
                                                     "skips hidden honeypot fields", "release builds request no sites", "until you allow one"], C["ember"])

d.card(784, 134, 404, 196, "server", "wera-api", ["/api/ext/tokens  connect, list, revoke", "/api/ext/jobs  add (private), lookup",
                                                   "/api/ext/extract  page text to fields", "/api/ext/answer  draft one answer",
                                                   "/api/jobs/{id}/cover-letter, tailored-resume", "/api/applicant  application details"], C["green"], tag="Go · bearer tokens")
d.card(784, 350, 190, 196, "db", "PostgreSQL", ["api_tokens (hashed)", "user_applicant", "jobs.added_by", "cover letters"], C["green"])
d.card(998, 350, 190, 196, "brain", "Inference API", ["extract, answers,", "letters, tailoring;", "untrusted page text", "is fenced"], C["violet"])

d.arrow([(434, 232), (352, 232)], "inject +\nmessages", C["blue"], label_at=(393, 212))
d.arrow([(704, 200), (784, 200)], "HTTPS + Bearer", C["blue"], label_at=(744, 190))
d.arrow([(569, 350), (569, 330)], color=C["slate"])
d.arrow([(880, 330), (880, 350)], color=C["green"])
d.arrow([(1092, 330), (1092, 350)], color=C["violet"])

d.text(36, 604, "Data flow: page -> side panel (you review) -> your server. The extension talks only to your server, which sends AI requests to the inference API.", 11.5, MUTED)
d.text(1212, 628, "Costs measured: read a page $0.0006, answer $0.0006, tailor $0.0013", 11, FAINT, anchor="end")

open(sys.argv[1], "w").write(d.svg())
