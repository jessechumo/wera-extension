import { describe, expect, it } from 'vitest';
import { accountWall } from './gate';

const show = (html: string) => {
  document.body.innerHTML = html;
  return accountWall(document);
};

describe('a page that wants an account first', () => {
  it('sign in and create account, with nothing to fill (Dayforce)', () => {
    expect(show(`<h2>Already Have an Account?</h2><button>Sign In</button><p>Don't have an account? <a href="#">Create one</a></p>`)).toMatch(/account first/);
  });

  it('a password box with little else', () => {
    expect(show('<label for="e">Email</label><input id="e" type="email"><label for="p">Password</label><input id="p" type="password"><button>Continue</button>')).toMatch(/account first/);
  });

  it('not an application with sign-in links in its header', () => {
    expect(show(`<a href="#">Sign in</a><a href="#">Create account</a>
      <label for="a">First name</label><input id="a"><label for="b">Last name</label><input id="b">
      <label for="c">Email</label><input id="c"><label for="d">Phone</label><input id="d">`)).toBeNull();
  });

  it('not a page with no way in', () => {
    expect(show('<h1>Software Engineer</h1><p>Join us.</p><a href="#">Apply</a>')).toBeNull();
  });

  it('not one link alone: every site has a sign-in link', () => {
    expect(show('<a href="#">Sign in</a><p>Open roles</p>')).toBeNull();
  });
});
