"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useSelector } from "react-redux";

export function CreatePost({ onPost, domain }) {
  const [caption, setCaption] = useState(""); // For text content
  const [image, setImage] = useState(null); // For image upload
  const [isSubmitting, setIsSubmitting] = useState(false); // To prevent duplicate submissions
  const { toast } = useToast();
  const { id } = useParams(); // Dynamically get community ID
  const { userType, token } = useSelector((state) => state.auth); // Get user type and token from Redux

  const validateContent = async () => {
    const geminiApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent";

    const contents = [];
    const promptText = `Do not give any explanation. Provide a binary (0, 1) output to determine if the content is safe for students.`;

    // Add text content for validation
    if (caption) {
      contents.push({
        role: "user",
        parts: [
          {
            text: caption,
          },
        ],
      });
    }

    // Add prompt text
    contents.push({
      role: "user",
      parts: [
        {
          text: promptText,
        },
      ],
    });

    // Add image content for validation if present
    let imageFileUri = null;
    if (image) {
      const formData = new FormData();
      formData.append("file", image);
      try {
        const uploadResponse = await fetch(
          `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: {
              "X-Goog-Upload-Command": "start, upload, finalize",
              "X-Goog-Upload-Header-Content-Length": image.size,
              "X-Goog-Upload-Header-Content-Type": image.type,
            },
            body: formData,
          }
        );

        if (!uploadResponse.ok) throw new Error("Image upload failed.");

        const uploadData = await uploadResponse.json();
        imageFileUri = uploadData.file.uri;

        contents.push({
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: imageFileUri,
                mimeType: image.type,
              },
            },
          ],
        });
      } catch (err) {
        console.error("Image validation failed:", err);
        toast({
          title: "Error",
          description: "Failed to validate the image. Please try again.",
        });
        return false;
      }
    }

    // Validate content with Gemini API
    try {
      const validationResponse = await fetch(`${geminiUrl}?key=${geminiApiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 1,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192,
            responseMimeType: "text/plain",
          },
        }),
      });

      if (!validationResponse.ok) throw new Error("Content validation failed.");

      const validationData = await validationResponse.json();

      // Parse response to check if content is safe
      const isContentSafe =
        validationData?.candidates?.[0]?.content?.parts?.[0]?.text.trim() === "1";

      return isContentSafe;
    } catch (err) {
      console.error("Validation error:", err);
      toast({
        title: "Error",
        description: "Failed to validate content. Please try again.",
      });
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!caption && !image) {
      toast({
        title: "Content required",
        description: "Add text or an image to post.",
      });
      return;
    }

    setIsSubmitting(true);

    // Validate content
    const isContentSafe = await validateContent();
    if (!isContentSafe) {
      toast({
        title: "Content Rejected",
        description: "Your post contains content that is not safe to publish.",
      });
      setIsSubmitting(false);
      return;
    }

    // Prepare the form data
    const formData = new FormData();
    formData.append("caption", caption);
    if (image) {
      formData.append("content", image);
    }

    try {
      // Make the POST request
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/${userType}/community/${id}/post`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "x-api-key": process.env.NEXT_PUBLIC_API_KEY,
          },
          body: formData,
        }
      );

      if (!response.ok) throw new Error("Failed to create post.");

      const newPost = await response.json();

      toast({
        title: "Post created",
        description: "Your post has been successfully created.",
      });

      onPost(newPost.post); // Notify parent about the new post

      // Clear inputs
      setCaption("");
      setImage(null);
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "There was an error creating your post. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg shadow bg-[#FFF5EE]">
      <h2 className="text-lg font-semibold mb-2">Create a Post</h2>

      {/* Caption Input */}
      <Textarea
        placeholder="What's on your mind?"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        className="mb-2"
      />

      {/* Image Upload */}
      <Input
        type="file"
        accept="image/*"
        onChange={(e) => setImage(e.target.files?.[0] || null)}
        className="mb-2"
      />

      <Button
        onClick={handleSubmit}
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Posting..." : "Post"}
      </Button>
    </div>
  );
}
