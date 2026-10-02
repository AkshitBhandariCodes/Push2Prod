import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@push2prod/db';

export async function GET() {
  try {
    // 1. Session check karo
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    // 2. DB se user ka GitHub Account fetch karo taaki access_token mil sake
    const account = await db.account.findFirst({
      where: {
        userId: session.user.id,
        provider: 'github'
      }
    });

    if (!account || !account.access_token) {
      return NextResponse.json({ 
        status: 'error', 
        message: 'GitHub account not linked or access token missing. Please sign in again.' 
      }, { status: 400 });
    }

    // 3. GitHub API call karo repositories ke liye (sort by recently updated)
    const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Push2Prod-App',
      }
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error('GitHub API error:', errorData);
      return NextResponse.json({ 
        status: 'error', 
        message: 'Failed to fetch repositories from GitHub' 
      }, { status: 502 });
    }

    const repos = await res.json();
    
    // 4. Sirf zaroori data map karke return karo
    const formattedRepos = repos.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      url: repo.html_url,
      cloneUrl: repo.clone_url, // URL used for `git clone`
      updatedAt: repo.updated_at
    }));

    return NextResponse.json({ status: 'success', repos: formattedRepos });

  } catch (error) {
    console.error('Error fetching github repos:', error);
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}
