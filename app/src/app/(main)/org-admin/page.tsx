"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Building2, FolderOpen, Activity, TrendingUp, Calendar, UserPlus, Search, RefreshCw, Settings, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AuditLogsTable } from "@/components/admin/audit-logs-table";
import { MembersTable } from "@/components/org-admin/members-table";
import type { MemberOrInvitation } from "@/components/org-admin/member-columns";

interface OrgStats {
  projects: number;
  jobs: number;
  tests: number;
  monitors: number;
  runs: number;
  members: number;
}

interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  inviterName: string;
  inviterEmail: string;
}

interface Project {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  isDefault: boolean;
  status: 'active' | 'archived' | 'deleted';
  createdAt: string;
  membersCount: number;
}

interface OrgDetails {
  id: string;
  name: string;
  slug?: string;
  logo?: string;
  createdAt: string;
}

export default function OrgAdminDashboard() {
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [orgDetails, setOrgDetails] = useState<OrgDetails | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Members tab state
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteData, setInviteData] = useState({
    email: "",
    role: "member" as 'member' | 'admin' | 'viewer',
    selectedProjects: [] as string[]
  });
  
  // Projects tab state
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [showCreateProjectDialog, setShowCreateProjectDialog] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    isDefault: false
  });

  useEffect(() => {
    fetchOrgData();
  }, []);

  const handleTabChange = (value: string) => {
    if (value === 'members' && (members.length === 0 || invitations.length === 0)) {
      fetchMembers();
      fetchInvitations();
    } else if (value === 'projects' && projects.length === 0) {
      fetchProjects();
    }
    // Note: Audit tab handles its own data fetching
  };

  const fetchOrgData = async () => {
    try {
      // Fetch organization stats and details
      const [statsResponse, detailsResponse] = await Promise.all([
        fetch('/api/organizations/stats'),
        fetch('/api/organizations/current')
      ]);
      
      const [statsData, detailsData] = await Promise.all([
        statsResponse.json(),
        detailsResponse.json()
      ]);

      if (statsData.success) {
        setStats(statsData.data);
      }
      
      if (detailsData.success) {
        setOrgDetails(detailsData.data);
      }
    } catch (error) {
      console.error('Error fetching organization data:', error);
      toast.error('Failed to load organization data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    setMembersLoading(true);
    try {
      const response = await fetch('/api/organizations/members');
      const data = await response.json();

      if (data.success) {
        setMembers(data.data);
      } else {
        toast.error('Failed to load members');
      }
    } catch (error) {
      console.error('Error fetching members:', error);
      toast.error('Failed to load members');
    } finally {
      setMembersLoading(false);
    }
  };

  const fetchInvitations = async () => {
    try {
      const response = await fetch('/api/organizations/invitations');
      const data = await response.json();

      if (data.success) {
        setInvitations(data.data);
      } else {
        console.error('Failed to load invitations:', data.error);
      }
    } catch (error) {
      console.error('Error fetching invitations:', error);
    }
  };

  const fetchProjects = async () => {
    setProjectsLoading(true);
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();

      if (data.success) {
        setProjects(data.data);
      } else {
        toast.error('Failed to load projects');
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      toast.error('Failed to load projects');
    } finally {
      setProjectsLoading(false);
    }
  };

  // Helper functions for project selection
  const handleProjectToggle = (projectId: string) => {
    setInviteData(prev => ({
      ...prev,
      selectedProjects: prev.selectedProjects.includes(projectId)
        ? prev.selectedProjects.filter(id => id !== projectId)
        : [...prev.selectedProjects, projectId]
    }));
  };

  const handleSelectAllProjects = () => {
    const activeProjectIds = projects
      .filter(project => project.status === 'active')
      .map(project => project.id);
    setInviteData(prev => ({
      ...prev,
      selectedProjects: activeProjectIds
    }));
  };

  const handleClearProjectSelection = () => {
    setInviteData(prev => ({
      ...prev,
      selectedProjects: []
    }));
  };

  const handleInviteMember = async () => {
    if (!inviteData.email.trim()) {
      toast.error('Email is required');
      return;
    }

    if (inviteData.selectedProjects.length === 0) {
      toast.error('Please select at least one project');
      return;
    }

    setInviting(true);
    try {
      const response = await fetch('/api/organizations/members/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inviteData),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Invitation sent to ${inviteData.email}. They can accept it using the link: ${data.data.inviteLink}`);
        setShowInviteDialog(false);
        setInviteData({ email: "", role: "member", selectedProjects: [] });
        fetchMembers();
        fetchInvitations();
        fetchOrgData(); // Refresh stats
      } else {
        toast.error(data.error || 'Failed to send invitation');
      }
    } catch (error) {
      console.error('Error inviting member:', error);
      toast.error('Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) {
      toast.error('Project name is required');
      return;
    }

    setCreatingProject(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newProject),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Project created successfully');
        setShowCreateProjectDialog(false);
        setNewProject({ name: "", description: "", isDefault: false });
        fetchProjects();
        fetchOrgData(); // Refresh stats
      } else {
        toast.error(data.error || 'Failed to create project');
      }
    } catch (error) {
      console.error('Error creating project:', error);
      toast.error('Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };


  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-4 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Organization Admin</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded w-16 animate-pulse mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-24 animate-pulse"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!stats || !orgDetails) {
    return (
      <div className="flex-1 space-y-4 p-4 pt-6">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Failed to load organization dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Organization Admin</h2>
          <p className="text-muted-foreground">{orgDetails.name}</p>
        </div>
      </div>
      
      <Tabs defaultValue="overview" className="space-y-4" onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Projects</CardTitle>
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.projects}</div>
                <p className="text-xs text-muted-foreground">
                  Active projects
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Members</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.members}</div>
                <p className="text-xs text-muted-foreground">
                  Organization members
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Jobs</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.jobs}</div>
                <p className="text-xs text-muted-foreground">
                  Scheduled jobs
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tests</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.tests}</div>
                <p className="text-xs text-muted-foreground">
                  Test cases
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monitors</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.monitors}</div>
                <p className="text-xs text-muted-foreground">
                  Active monitors
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.runs}</div>
                <p className="text-xs text-muted-foreground">
                  Test executions
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium">Projects ({projects.length})</h3>
              <p className="text-sm text-muted-foreground">
                Manage projects within your organization.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { fetchProjects(); fetchOrgData(); }}
                disabled={projectsLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Dialog open={showCreateProjectDialog} onOpenChange={setShowCreateProjectDialog}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Create Project
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Project</DialogTitle>
                    <DialogDescription>
                      Create a new project in your organization.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="project-name" className="text-right">Name</Label>
                      <Input
                        id="project-name"
                        value={newProject.name}
                        onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                        className="col-span-3"
                        placeholder="My Project"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="project-description" className="text-right">Description</Label>
                      <Input
                        id="project-description"
                        value={newProject.description}
                        onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                        className="col-span-3"
                        placeholder="Project description"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCreateProject} disabled={creatingProject}>
                      {creatingProject ? "Creating..." : "Create Project"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search projects by name..."
                  value={projectSearchQuery}
                  onChange={(e) => setProjectSearchQuery(e.target.value)}
                  className="max-w-sm"
                />
              </div>
            </CardHeader>
            <CardContent>
              {projectsLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-4">
                      <div className="h-10 w-10 bg-gray-200 rounded animate-pulse"></div>
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/3 animate-pulse"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border">
                  <div className="relative w-full overflow-auto">
                    <table className="w-full caption-bottom text-sm">
                      <thead className="[&_tr]:border-b">
                        <tr className="border-b transition-colors hover:bg-muted/50">
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Name</th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Members</th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Created</th>
                        </tr>
                      </thead>
                      <tbody className="[&_tr:last-child]:border-0">
                        {projects
                          .filter(project => 
                            project.name.toLowerCase().includes(projectSearchQuery.toLowerCase())
                          )
                          .map((project) => (
                          <tr key={project.id} className="border-b transition-colors hover:bg-muted/50">
                            <td className="p-4 align-middle">
                              <div className="font-medium">{project.name}</div>
                              {project.description && (
                                <div className="text-sm text-muted-foreground">{project.description}</div>
                              )}
                              {project.isDefault && (
                                <div className="text-xs text-blue-600 font-medium">Default</div>
                              )}
                            </td>
                            <td className="p-4 align-middle">
                              <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                project.status === 'active' ? 'bg-green-100 text-green-700' :
                                project.status === 'archived' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {project.status}
                              </span>
                            </td>
                            <td className="p-4 align-middle text-muted-foreground">{project.membersCount}</td>
                            <td className="p-4 align-middle text-muted-foreground">
                              {new Date(project.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium">Team Management</h3>
              <p className="text-sm text-muted-foreground">
                Manage organization members, their roles, and pending invitations.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { fetchMembers(); fetchInvitations(); fetchOrgData(); }}
                disabled={membersLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <MembersTable
                members={[
                  ...members.map(m => ({ ...m, type: 'member' as const })),
                  ...invitations
                    .filter(i => i.status === 'pending' || i.status === 'expired')
                    .map(i => ({ ...i, type: 'invitation' as const }))
                ]}
                onMemberUpdate={() => {
                  fetchMembers();
                  fetchInvitations();
                  fetchOrgData();
                }}
                onInviteMember={() => {
                  setShowInviteDialog(true);
                  if (projects.length === 0) {
                    fetchProjects();
                  }
                }}
                isLoading={membersLoading}
              />
            </CardContent>
          </Card>

          {/* Invite Member Dialog */}
          <Dialog open={showInviteDialog} onOpenChange={(open) => {
            setShowInviteDialog(open);
            if (open && projects.length === 0) {
              fetchProjects();
            }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite New Member</DialogTitle>
                <DialogDescription>
                  Invite a new member to your organization.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="email" className="text-right">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={inviteData.email}
                    onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                    className="col-span-3"
                    placeholder="user@example.com"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="role" className="text-right">Role</Label>
                  <Select
                    value={inviteData.role}
                    onValueChange={(value) => setInviteData({ ...inviteData, role: value as any })}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Project Selection */}
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label className="text-right pt-2">Projects</Label>
                  <div className="col-span-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Select projects to grant access to ({inviteData.selectedProjects.length} selected)
                      </span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleSelectAllProjects}
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleClearProjectSelection}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    
                    <div className="max-h-48 overflow-y-auto border rounded-md p-3 space-y-2">
                      {projectsLoading ? (
                        <div className="text-sm text-muted-foreground">Loading projects...</div>
                      ) : projects.filter(p => p.status === 'active').length === 0 ? (
                        <div className="text-sm text-muted-foreground">No active projects available</div>
                      ) : (
                        projects
                          .filter(project => project.status === 'active')
                          .map((project) => (
                            <div key={project.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`project-${project.id}`}
                                checked={inviteData.selectedProjects.includes(project.id)}
                                onCheckedChange={() => handleProjectToggle(project.id)}
                              />
                              <Label
                                htmlFor={`project-${project.id}`}
                                className="text-sm font-normal cursor-pointer flex-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span>{project.name}</span>
                                  {project.isDefault && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                      Default
                                    </span>
                                  )}
                                </div>
                                {project.description && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {project.description}
                                  </div>
                                )}
                              </Label>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleInviteMember} disabled={inviting || inviteData.selectedProjects.length === 0}>
                  {inviting ? "Sending..." : "Send Invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <AuditLogsTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}