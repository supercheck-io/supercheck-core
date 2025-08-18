"use client";
import React from "react";
import { CreateCard } from "./create-card";
import { useRouter } from "next/navigation";
import {
  Video,
  Clock,
  Zap,
  Variable,
  Shield,
  Bell
} from "lucide-react";
import { monitorTypes } from "@/components/monitors/data";
import { types } from "@/components/tests/data";

type ScriptType = "browser" | "api" | "custom" | "database" | "record";

export function CreatePageContent() {
  const router = useRouter();

  const handleScriptSelection = (scriptType: ScriptType) => {
    // Navigate to the playground page with the script type as a query parameter
    router.push(`/playground?scriptType=${scriptType}`);
  };

  const testTypes = [
    ...types.map((type) => ({
      icon: <type.icon size={24} className={type.color} />,
      title: type.label,
      path: `/create/${type.value}`,
      scriptType: type.value as ScriptType,
    })),
    {
      icon: <Video size={24} className="text-red-500" />,
      title: "Record",
      path: "https://chromewebstore.google.com/detail/playwright-crx/jambeljnbnfbkcpnoiaedcabbgmnnlcd",
      scriptType: "record" as ScriptType,
    },
  ];

  const jobTypes = [
    {
      icon: <Clock size={24} className="text-blue-500" />,
      title: "Scheduled Job",
      onClick: () => router.push("/jobs/create"),
    },
    {
      icon: <Zap size={24} className="text-amber-500" />,
      title: "Immediate Job",
      onClick: () => router.push("/jobs/create"),
    },
  ];

  const variableTypes = [
    {
      icon: <Variable size={24} className="text-green-500" />,
      title: "Variable",
      onClick: () => router.push("/variables"),
    },
    {
      icon: <Shield size={24} className="text-purple-500" />,
      title: "Secret",
      onClick: () => router.push("/variables?filter=secrets"),
    },
  ];

  const notificationTypes = [
    {
      icon: <Bell size={24} className="text-orange-500" />,
      title: "Notification Channel",
      onClick: () => router.push("/alerts"),
    },
  ];

  return (
    <div className="mx-auto p-4 mt-5">
      <div className="mb-2 pl-1">
        <h2 className="text-xl font-bold">Create New Test</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Select the type of test you want to create
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {testTypes.map((testType) => (
          <CreateCard
            key={testType.scriptType || testType.title}
            icon={testType.icon}
            title={testType.title}
            onClick={() =>
              testType.title === "Record"
                ? window.open(testType.path, "_blank")
                : testType.scriptType
                ? handleScriptSelection(testType.scriptType as ScriptType)
                : undefined
            }
            className={
              testType.title === "Record" ? "border-dashed" : ""
            }
          />
        ))}
      </div>

      <div className="mt-10 mb-2 pl-1">
        <h2 className="text-xl font-bold">Create New Job</h2>
        <p className="text-muted-foreground text-sm mt-1"> Configure a new automated or manual job</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {jobTypes.map((jobType) => (
          <CreateCard
            key={jobType.title}
            icon={jobType.icon}
            title={jobType.title}
            onClick={jobType.onClick}
          />
        ))}
      </div>

      <div className="mt-10 mb-2 pl-1">
        <h2 className="text-xl font-bold">Create New Monitor</h2>
        <p className="text-muted-foreground text-sm mt-1">Select the type of uptime monitor you want to create</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {monitorTypes.map((monitorType) => {
          const IconComponent = monitorType.icon;
          return (
            <CreateCard
              key={monitorType.value}
              icon={<IconComponent size={24} className={monitorType.color} />}
              title={monitorType.label}
              onClick={() => router.push(`/monitors/create?type=${monitorType.value}`)}
            />
          );
        })}
      </div>

      <div className="mt-10 mb-2 pl-1">
        <h2 className="text-xl font-bold">Create Variables & Secrets</h2>
        <p className="text-muted-foreground text-sm mt-1">Configure environment variables and secure secrets</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {variableTypes.map((variableType) => (
          <CreateCard
            key={variableType.title}
            icon={variableType.icon}
            title={variableType.title}
            onClick={variableType.onClick}
          />
        ))}
      </div>

      <div className="mt-10 mb-2 pl-1">
        <h2 className="text-xl font-bold">Create Notification Provider</h2>
        <p className="text-muted-foreground text-sm mt-1">Configure alert notifications and view delivery history</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {notificationTypes.map((notificationType) => (
          <CreateCard
            key={notificationType.title}
            icon={notificationType.icon}
            title={notificationType.title}
            onClick={notificationType.onClick}
          />
        ))}
      </div>

    </div>
  );
}
